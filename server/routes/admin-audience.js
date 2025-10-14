const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const csv = require('csv-parser');
const { Readable } = require('stream');

const dataManager = require('../utils/dataManager');
const notificationService = require('../utils/notificationService');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '../uploads/images');
    await dataManager.ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only image files and CSV files are allowed'));
    }
  }
});

// Apply authentication middleware to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// AUDIENCE MANAGEMENT
router.get('/audience', async (req, res) => {
  try {
    const audience = await dataManager.readData('audience');
    // Remove login codes from response for security
    const safeAudience = {
      ...audience,
      list: audience.list.map(({ loginCode, qrCode, ...member }) => member)
    };
    res.json(safeAudience);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audience' });
  }
});

router.post('/audience', async (req, res) => {
  try {
    const { firstName, lastName, mobile, email, company } = req.body;
    
    if (!dataManager.validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const audience = await dataManager.readData('audience');
    
    // Check if email already exists
    const existingMember = audience.list.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (existingMember) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const loginCode = dataManager.generateCode(6);
    const qrResult = await notificationService.generateQRCode(loginCode);
    
    const newMember = {
      id: dataManager.generateId(),
      firstName,
      lastName,
      mobile,
      email,
      company,
      loginCode,
      qrCode: qrResult.success ? qrResult.qrCode : null,
      createdAt: new Date().toISOString()
    };

    audience.list.push(newMember);
    await dataManager.writeData('audience', audience);

    res.status(201).json({ 
      ...newMember,
      loginCode: undefined, // Don't return login code
      qrCode: undefined     // Don't return QR code
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating audience member' });
  }
});

router.post('/audience/csv-import', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const csvData = [];
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    
    // Parse CSV content
    const stream = Readable.from([fileContent]);
    
    return new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          csvData.push(row);
        })
        .on('end', async () => {
          try {
            const audience = await dataManager.readData('audience');
            const newMembers = [];
            const errors = [];

            for (const row of csvData) {
              const { firstname, lastname, mobile, email, company } = row;
              
              if (!email || !dataManager.validateEmail(email)) {
                errors.push(`Invalid email: ${email || 'missing'}`);
                continue;
              }

              // Check if email already exists
              const existingMember = audience.list.find(m => m.email.toLowerCase() === email.toLowerCase());
              if (existingMember) {
                errors.push(`Email already exists: ${email}`);
                continue;
              }

              const loginCode = dataManager.generateCode(6);
              const qrResult = await notificationService.generateQRCode(loginCode);
              
              const newMember = {
                id: dataManager.generateId(),
                firstName: firstname || '',
                lastName: lastname || '',
                mobile: mobile || '',
                email: email.toLowerCase(),
                company: company || '',
                loginCode,
                qrCode: qrResult.success ? qrResult.qrCode : null,
                createdAt: new Date().toISOString(),
                importedAt: new Date().toISOString()
              };

              audience.list.push(newMember);
              newMembers.push(newMember);
            }

            await dataManager.writeData('audience', audience);

            // Clean up uploaded file
            await fs.unlink(req.file.path);

            res.json({
              message: `Successfully imported ${newMembers.length} members`,
              imported: newMembers.length,
              errors: errors
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });

  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ message: 'Error importing CSV file' });
  }
});

router.post('/audience/:id/send-email', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await dataManager.readData('audience');
    
    const member = audience.list.find(m => m.id === id);
    if (!member) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    const emailResult = await notificationService.sendLoginCode(
      member.email,
      member.loginCode,
      `${member.firstName} ${member.lastName}`
    );

    if (emailResult.success) {
      member.emailSentAt = new Date().toISOString();
      await dataManager.writeData('audience', audience);
      res.json({ message: 'Email sent successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send email' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error sending email' });
  }
});

router.post('/audience/send-all-emails', async (req, res) => {
  try {
    const audience = await dataManager.readData('audience');
    const results = { success: 0, failed: 0, errors: [] };

    // Helper function to add delay between emails
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < audience.list.length; i++) {
      const member = audience.list[i];
      
      try {
        const emailResult = await notificationService.sendLoginCode(
          member.email,
          member.loginCode,
          `${member.firstName} ${member.lastName}`
        );

        if (emailResult.success) {
          results.success++;
          member.emailSentAt = new Date().toISOString();
        } else {
          results.failed++;
          results.errors.push(`Failed to send to ${member.email}: ${emailResult.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error sending to ${member.email}: ${error.message}`);
      }

      // Add 2 second delay between each email to avoid rate limiting
      if (i < audience.list.length - 1) {
        await delay(2000);
      }
    }

    await dataManager.writeData('audience', audience);

    res.json({
      message: `Email sending completed. Success: ${results.success}, Failed: ${results.failed}`,
      ...results
    });
  } catch (error) {
    res.status(500).json({ message: 'Error sending bulk emails' });
  }
});

router.get('/audience/:id/qr-code', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await dataManager.readData('audience');
    
    const member = audience.list.find(m => m.id === id);
    if (!member) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    if (!member.qrCode) {
      // Generate QR code if not exists
      const qrResult = await notificationService.generateQRCode(member.loginCode);
      if (qrResult.success) {
        member.qrCode = qrResult.qrCode;
        await dataManager.writeData('audience', audience);
      }
    }

    res.json({ qrCode: member.qrCode, loginCode: member.loginCode });
  } catch (error) {
    res.status(500).json({ message: 'Error generating QR code' });
  }
});

router.put('/audience/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, mobile, email, company } = req.body;
    const audience = await dataManager.readData('audience');
    
    const memberIndex = audience.list.findIndex(m => m.id === id);
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    if (email && !dataManager.validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const member = audience.list[memberIndex];
    member.firstName = firstName || member.firstName;
    member.lastName = lastName || member.lastName;
    member.mobile = mobile || member.mobile;
    member.email = email || member.email;
    member.company = company || member.company;
    member.updatedAt = new Date().toISOString();

    await dataManager.writeData('audience', audience);
    
    const { loginCode, qrCode, ...safeResponse } = member;
    res.json(safeResponse);
  } catch (error) {
    res.status(500).json({ message: 'Error updating audience member' });
  }
});

router.delete('/audience/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await dataManager.readData('audience');
    
    const memberIndex = audience.list.findIndex(m => m.id === id);
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    audience.list.splice(memberIndex, 1);
    await dataManager.writeData('audience', audience);

    res.json({ message: 'Audience member deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting audience member' });
  }
});

module.exports = router;