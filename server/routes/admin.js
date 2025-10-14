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



// Temporary test endpoint (remove in production)
router.get('/test-results', async (req, res) => {
  try {
    // Same logic as the main results endpoint but without auth
    const [categories, contestants, judges, scores, settings] = await Promise.all([
      dataManager.readData('categories'),
      dataManager.readData('contestants'), 
      dataManager.readData('judges'),
      dataManager.readData('scores'),
      dataManager.readData('settings')
    ]);

    const results = {};
    
    for (const category of categories.list) {
      const categoryContestants = contestants.list.filter(c => c.categoryId === category.id);
      const categoryResults = [];

      for (const contestant of categoryContestants) {
        // Calculate judge scores
        const judgeScores = scores.judgeScores[contestant.id] || {};
        let totalJudgeScore = 0;
        let judgeCount = 0;

        Object.values(judgeScores).forEach(judgeScore => {
          if (judgeScore.totalScore !== undefined) {
            totalJudgeScore += judgeScore.totalScore || 0;
            judgeCount++;
          }
        });

        const avgJudgeScore = judgeCount > 0 ? totalJudgeScore / judgeCount : 0;

        // Calculate audience votes with proper ratio calculation
        const rawAudienceVotes = scores.audienceVotes[contestant.id] || 0;
        
        // Get total number of users who actually voted (active voters)
        const totalActiveVoters = scores.userVotes ? Object.keys(scores.userVotes).length : 0;
        
        // Calculate audience participation ratio (votes for this contestant / total active voters)
        const audienceParticipationRatio = totalActiveVoters > 0 ? rawAudienceVotes / totalActiveVoters : 0;
        
        // Calculate weighted scores as percentages out of 100
        const judgeWeightPercentage = settings.scoreWeights.judges; // e.g., 70
        const audienceWeightPercentage = settings.scoreWeights.audience; // e.g., 30
        
        // Judge score: Convert average to percentage (7/10 = 70%) then apply weight (70% × 70% = 49%)
        const judgePercentage = (avgJudgeScore / 10) * 100; // Convert to percentage (0-100)
        const weightedJudgeScore = (judgePercentage * judgeWeightPercentage) / 100; // Apply weight
        
        // Audience score: Participation ratio as percentage applied to audience weight
        // Example: 2/4 voters = 50% participation × 30% weight = 15%
        const audiencePercentage = audienceParticipationRatio * 100; // Convert to percentage
        const weightedAudienceScore = (audiencePercentage * audienceWeightPercentage) / 100;
        
        const finalScore = weightedJudgeScore + weightedAudienceScore;

        categoryResults.push({
          contestant,
          judgeScore: avgJudgeScore,
          judgePercentage: judgePercentage,
          audienceVotes: rawAudienceVotes,
          totalActiveVoters: totalActiveVoters,
          audienceParticipationRatio: audienceParticipationRatio,
          audiencePercentage: audiencePercentage,
          weightedJudgeScore: weightedJudgeScore,
          weightedAudienceScore: weightedAudienceScore,
          finalScore,
          judgeCount
        });
      }

      categoryResults.sort((a, b) => b.finalScore - a.finalScore);
      results[category.id] = {
        category,
        results: categoryResults
      };
    }

    res.json({ results });
  } catch (error) {
    console.error('Test results error:', error);
    res.status(500).json({ message: 'Error fetching test results' });
  }
});

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
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    fieldSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    console.log('File upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
    }
  }
});

// Test endpoint without authentication
router.get('/test-data', async (req, res) => {
  try {
    const [scores, judges] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('judges')
    ]);
    
    const activeJudges = new Set();
    Object.values(scores.judgeScores || {}).forEach(contestantScores => {
      Object.keys(contestantScores).forEach(judgeId => {
        activeJudges.add(judgeId);
      });
    });

    const judgeInfo = judges.list.map(judge => ({
      id: judge.id,
      name: judge.name,
      hasScored: activeJudges.has(judge.id)
    }));
    
    res.json({
      activeJudges: Array.from(activeJudges).sort(),
      judges: judgeInfo,
      rawScores: scores.judgeScores,
      hasJudgeScores: Object.keys(scores.judgeScores || {}).length > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply authentication middleware to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// CATEGORIES MANAGEMENT
router.get('/categories', async (req, res) => {
  try {
    const categories = await dataManager.readData('categories');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

router.post('/categories', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ message: err.message });
    }

    try {
      const { name, description } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Category name is required' });
      }

      const categories = await dataManager.readData('categories');
      
      // Check if category name already exists
      const existingCategory = categories.list.find(c => 
        c.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      if (existingCategory) {
        return res.status(400).json({ message: 'Category name already exists' });
      }
      
      const newCategory = {
        id: dataManager.generateId(),
        name: name.trim(),
        description: description || '',
        image: req.file ? `/uploads/images/${req.file.filename}` : null,
        createdAt: new Date().toISOString()
      };

      categories.list.push(newCategory);
      await dataManager.writeData('categories', categories);

      res.status(201).json(newCategory);
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({ message: 'Error creating category' });
    }
  });
});

router.put('/categories/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const categories = await dataManager.readData('categories');
    
    const categoryIndex = categories.list.findIndex(c => c.id === id);
    if (categoryIndex === -1) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const category = categories.list[categoryIndex];
    category.name = name || category.name;
    if (req.file) {
      category.image = `/uploads/images/${req.file.filename}`;
    }
    category.updatedAt = new Date().toISOString();

    await dataManager.writeData('categories', categories);
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Error updating category' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const categories = await dataManager.readData('categories');
    
    const categoryIndex = categories.list.findIndex(c => c.id === id);
    if (categoryIndex === -1) {
      return res.status(404).json({ message: 'Category not found' });
    }

    categories.list.splice(categoryIndex, 1);
    await dataManager.writeData('categories', categories);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting category' });
  }
});

// CONTESTANTS MANAGEMENT
router.get('/contestants', async (req, res) => {
  try {
    const contestants = await dataManager.readData('contestants');
    res.json(contestants);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching contestants' });
  }
});

router.post('/contestants', upload.single('image'), async (req, res) => {
  try {
    const { name, company, description, categoryId } = req.body;
    const contestants = await dataManager.readData('contestants');
    
    const newContestant = {
      id: dataManager.generateId(),
      name,
      company,
      description,
      categoryId,
      image: req.file ? `/uploads/images/${req.file.filename}` : null,
      createdAt: new Date().toISOString()
    };

    contestants.list.push(newContestant);
    await dataManager.writeData('contestants', contestants);

    res.status(201).json(newContestant);
  } catch (error) {
    res.status(500).json({ message: 'Error creating contestant' });
  }
});

router.put('/contestants/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, description, categoryId } = req.body;
    const contestants = await dataManager.readData('contestants');
    
    const contestantIndex = contestants.list.findIndex(c => c.id === id);
    if (contestantIndex === -1) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    const contestant = contestants.list[contestantIndex];
    contestant.name = name || contestant.name;
    contestant.company = company || contestant.company;
    contestant.description = description || contestant.description;
    contestant.categoryId = categoryId || contestant.categoryId;
    if (req.file) {
      contestant.image = `/uploads/images/${req.file.filename}`;
    }
    contestant.updatedAt = new Date().toISOString();

    await dataManager.writeData('contestants', contestants);
    res.json(contestant);
  } catch (error) {
    res.status(500).json({ message: 'Error updating contestant' });
  }
});

router.delete('/contestants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contestants = await dataManager.readData('contestants');
    
    const contestantIndex = contestants.list.findIndex(c => c.id === id);
    if (contestantIndex === -1) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    contestants.list.splice(contestantIndex, 1);
    await dataManager.writeData('contestants', contestants);

    res.json({ message: 'Contestant deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting contestant' });
  }
});

// JUDGES MANAGEMENT
router.get('/judges', async (req, res) => {
  try {
    const judges = await dataManager.readData('judges');
    // Remove passwords from response
    const safeJudges = {
      ...judges,
      list: judges.list.map(({ password, ...judge }) => judge)
    };
    res.json(safeJudges);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching judges' });
  }
});

router.post('/judges', upload.single('image'), async (req, res) => {
  try {
    const { name, description, username } = req.body;
    const judges = await dataManager.readData('judges');
    
    // Generate random password
    const password = dataManager.generateCode(8);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newJudge = {
      id: dataManager.generateId(),
      name,
      username,
      description,
      image: req.file ? `/uploads/images/${req.file.filename}` : null,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    judges.list.push(newJudge);
    await dataManager.writeData('judges', judges);

    // Return without password, but include the plain password for copying
    const { password: _, ...judgeResponse } = newJudge;
    res.status(201).json({ ...judgeResponse, generatedPassword: password });
  } catch (error) {
    res.status(500).json({ message: 'Error creating judge' });
  }
});

router.put('/judges/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, username } = req.body;
    const judges = await dataManager.readData('judges');
    
    const judgeIndex = judges.list.findIndex(j => j.id === id);
    if (judgeIndex === -1) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    const judge = judges.list[judgeIndex];
    judge.name = name || judge.name;
    judge.username = username || judge.username;
    judge.description = description || judge.description;
    if (req.file) {
      judge.image = `/uploads/images/${req.file.filename}`;
    }
    judge.updatedAt = new Date().toISOString();

    await dataManager.writeData('judges', judges);
    
    const { password, ...judgeResponse } = judge;
    res.json(judgeResponse);
  } catch (error) {
    res.status(500).json({ message: 'Error updating judge' });
  }
});

router.post('/judges/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const judges = await dataManager.readData('judges');
    
    const judgeIndex = judges.list.findIndex(j => j.id === id);
    if (judgeIndex === -1) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    const newPassword = dataManager.generateCode(8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    judges.list[judgeIndex].password = hashedPassword;
    judges.list[judgeIndex].passwordResetAt = new Date().toISOString();
    
    await dataManager.writeData('judges', judges);

    res.json({ message: 'Password reset successfully', generatedPassword: newPassword });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password' });
  }
});

router.delete('/judges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const judges = await dataManager.readData('judges');
    
    const judgeIndex = judges.list.findIndex(j => j.id === id);
    if (judgeIndex === -1) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    judges.list.splice(judgeIndex, 1);
    await dataManager.writeData('judges', judges);

    res.json({ message: 'Judge deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting judge' });
  }
});

// ADMIN MANAGEMENT
router.get('/admins', async (req, res) => {
  try {
    const admins = await dataManager.readData('admins');
    // Remove passwords from response
    const safeAdmins = {
      ...admins,
      users: admins.users.map(({ password, ...admin }) => admin)
    };
    res.json(safeAdmins);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admins' });
  }
});

router.post('/admins', upload.single('image'), async (req, res) => {
  try {
    const { firstName, lastName, mobile, email, username } = req.body;
    
    if (!dataManager.validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const admins = await dataManager.readData('admins');
    
    // Check if username or email already exists
    const existingAdmin = admins.users.find(a => 
      a.username === username || a.email.toLowerCase() === email.toLowerCase()
    );
    if (existingAdmin) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Generate random password
    const password = dataManager.generateCode(8);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newAdmin = {
      id: dataManager.generateId(),
      username,
      firstName,
      lastName,
      mobile,
      email,
      image: req.file ? `/uploads/images/${req.file.filename}` : null,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    admins.users.push(newAdmin);
    await dataManager.writeData('admins', admins);

    // Return without password, but include the plain password for copying
    const { password: _, ...adminResponse } = newAdmin;
    res.status(201).json({ ...adminResponse, generatedPassword: password });
  } catch (error) {
    res.status(500).json({ message: 'Error creating admin' });
  }
});

// AUDIENCE MANAGEMENT
router.get('/audience', async (req, res) => {
  try {
    let audience;
    try {
      audience = await dataManager.readData('audience');
    } catch (error) {
      // If audience.json doesn't exist, create default structure
      audience = { list: [] };
      await dataManager.writeData('audience', audience);
    }
    
    // Ensure audience has proper structure
    if (!audience.list) {
      audience.list = [];
    }
    
    // Remove login codes from response for security
    const safeAudience = {
      ...audience,
      list: audience.list.map(({ loginCode, qrCode, ...member }) => member)
    };
    res.json(safeAudience);
  } catch (error) {
    console.error('Error fetching audience:', error);
    res.status(500).json({ message: 'Error fetching audience' });
  }
});

router.post('/audience', async (req, res) => {
  try {
    const { firstName, lastName, mobile, email, company } = req.body;
    
    if (!dataManager.validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    let audience;
    try {
      audience = await dataManager.readData('audience');
    } catch (error) {
      // If audience.json doesn't exist, create default structure
      audience = { list: [] };
    }
    
    // Ensure audience has proper structure
    if (!audience.list) {
      audience.list = [];
    }
    
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

// JUDGING CRITERIA MANAGEMENT
router.get('/judging-criteria/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    // First try to get criteria from settings (new category-specific system)
    try {
      const settings = await dataManager.readData('settings');
      if (settings.categoryScoringCriteria && settings.categoryScoringCriteria[categoryId]) {
        const categoryCriteria = settings.categoryScoringCriteria[categoryId].map((criteria, index) => ({
          id: `${categoryId}_${index}`,
          name: criteria.name,
          description: criteria.description || '',
          weight: criteria.weight,
          maxScore: criteria.maxScore
        }));
        return res.json({ categoryId, criteria: categoryCriteria });
      }
    } catch (settingsError) {
      console.log('No settings found or no category criteria, checking legacy format');
    }
    
    // Fallback to legacy judgingCriteria.json format
    try {
      const criteria = await dataManager.readData('judgingCriteria');
      const categoryCriteria = criteria.categories[categoryId] || [];
      res.json({ categoryId, criteria: categoryCriteria });
    } catch (legacyError) {
      // No criteria found at all, return empty array
      res.json({ categoryId, criteria: [] });
    }
  } catch (error) {
    console.error('Error fetching judging criteria:', error);
    res.status(500).json({ message: 'Error fetching judging criteria' });
  }
});

router.post('/judging-criteria/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { criteria, description, weight, maxScore } = req.body;
    
    const judgingCriteria = await dataManager.readData('judgingCriteria');
    
    if (!judgingCriteria.categories[categoryId]) {
      judgingCriteria.categories[categoryId] = [];
    }

    const newCriteria = {
      id: dataManager.generateId(),
      criteria,
      description,
      weight: parseInt(weight),
      maxScore: parseInt(maxScore),
      createdAt: new Date().toISOString()
    };

    judgingCriteria.categories[categoryId].push(newCriteria);
    await dataManager.writeData('judgingCriteria', judgingCriteria);

    res.status(201).json(newCriteria);
  } catch (error) {
    res.status(500).json({ message: 'Error creating judging criteria' });
  }
});

// SETTINGS MANAGEMENT
router.get('/settings', async (req, res) => {
  try {
    const settings = await dataManager.readData('settings');
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const newSettings = req.body;
    
    // Validate required fields
    if (!newSettings.eventName || !newSettings.eventDescription) {
      return res.status(400).json({ message: 'Event name and description are required' });
    }

    // Validate scoring criteria weights sum to 100%
    if (newSettings.scoringCriteria && Array.isArray(newSettings.scoringCriteria)) {
      const totalWeight = newSettings.scoringCriteria.reduce((sum, criteria) => sum + (criteria.weight || 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        return res.status(400).json({ message: 'Scoring criteria weights must sum to 100%' });
      }
    }

    // Validate judge and audience weights sum to 100%
    const judgeWeight = newSettings.judgeScoreWeight || 0;
    const audienceWeight = newSettings.audienceVoteWeight || 0;
    if (Math.abs(judgeWeight + audienceWeight - 100) > 0.01) {
      return res.status(400).json({ message: 'Judge and audience weights must sum to 100%' });
    }

    // Get existing settings to preserve system data
    let existingSettings = {};
    try {
      existingSettings = await dataManager.readData('settings');
    } catch (error) {
      // If no settings exist, start with empty object
      existingSettings = {};
    }

    // Merge settings, keeping system data intact
    const updatedSettings = {
      ...existingSettings,
      ...newSettings,
      updatedAt: new Date().toISOString(),
      // Preserve system data that shouldn't be overwritten by UI
      results: existingSettings.results || { published: false, winners: {} }
    };

    await dataManager.writeData('settings', updatedSettings);
    
    // Refresh email transporter if email settings were updated
    if (newSettings.emailSettings) {
      try {
        await notificationService.refreshTransporter();
        console.log('Email transporter refreshed with new settings');
      } catch (refreshError) {
        console.error('Error refreshing email transporter:', refreshError);
      }
    }
    
    res.json({ message: 'Settings saved successfully', settings: updatedSettings });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ message: 'Error saving settings' });
  }
});

router.post('/settings/test-email', async (req, res) => {
  try {
    const emailSettings = req.body;
    
    // Temporarily update notification service with new settings
    const originalTransporter = notificationService.transporter;
    
    const nodemailer = require('nodemailer');
    const testTransporter = nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpPort === 465,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPassword
      }
    });

    // Test the connection
    await testTransporter.verify();
    
    // Send test email
    const testMailOptions = {
      from: `${emailSettings.fromName} <${emailSettings.fromEmail}>`,
      to: emailSettings.smtpUser, // Send test email to the configured email
      subject: 'CTRL + ALT + ROCK - Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
            <h1>🎸 Email Configuration Test 🎸</h1>
          </div>
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h2>Success!</h2>
            <p>Your email configuration is working correctly.</p>
            <p><strong>SMTP Host:</strong> ${emailSettings.smtpHost}</p>
            <p><strong>From Email:</strong> ${emailSettings.fromEmail}</p>
            <p><strong>Test Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `
    };

    await testTransporter.sendMail(testMailOptions);
    
    res.json({ message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ message: `Email test failed: ${error.message}` });
  }
});

router.put('/settings/voting', async (req, res) => {
  try {
    const { votingOpen } = req.body;
    const settings = await dataManager.readData('settings');
    
    settings.votingOpen = votingOpen;
    settings.votingStatusUpdatedAt = new Date().toISOString();
    
    await dataManager.writeData('settings', settings);
    res.json({ message: 'Voting status updated', votingOpen });
  } catch (error) {
    res.status(500).json({ message: 'Error updating voting status' });
  }
});

router.put('/settings/score-weights', async (req, res) => {
  try {
    const { judges, audience } = req.body;
    
    if (judges + audience !== 100) {
      return res.status(400).json({ message: 'Judge and audience weights must total 100%' });
    }

    const settings = await dataManager.readData('settings');
    
    settings.scoreWeights = { judges, audience };
    settings.scoreWeightsUpdatedAt = new Date().toISOString();
    
    await dataManager.writeData('settings', settings);
    res.json({ message: 'Score weights updated', scoreWeights: settings.scoreWeights });
  } catch (error) {
    res.status(500).json({ message: 'Error updating score weights' });
  }
});

// RESULTS MANAGEMENT
router.get('/results', async (req, res) => {
  try {
    const [scores, contestants, categories, settings] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants'),
      dataManager.readData('categories'),
      dataManager.readData('settings')
    ]);

    // Calculate results for each category
    const results = {};
    
    for (const category of categories.list) {
      const categoryContestants = contestants.list.filter(c => c.categoryId === category.id);
      const categoryResults = [];

      for (const contestant of categoryContestants) {
        // Calculate judge scores
        const judgeScores = scores.judgeScores[contestant.id] || {};
        let totalJudgeScore = 0;
        let judgeCount = 0;

        Object.values(judgeScores).forEach(judgeScore => {
          // For admin results, include both finalized and non-finalized scores
          if (judgeScore.totalScore !== undefined) {
            totalJudgeScore += judgeScore.totalScore || 0;
            judgeCount++;
          }
        });

        const avgJudgeScore = judgeCount > 0 ? totalJudgeScore / judgeCount : 0;

        // Calculate audience votes with proper ratio calculation
        const rawAudienceVotes = scores.audienceVotes[contestant.id] || 0;
        
        // Get total number of users who actually voted (active voters)
        const totalActiveVoters = scores.userVotes ? Object.keys(scores.userVotes).length : 0;
        
        // Calculate audience participation ratio (votes for this contestant / total active voters)
        const audienceParticipationRatio = totalActiveVoters > 0 ? rawAudienceVotes / totalActiveVoters : 0;
        
        // Calculate weighted scores as percentages out of 100
        const judgeWeightPercentage = settings.scoreWeights.judges; // e.g., 70
        const audienceWeightPercentage = settings.scoreWeights.audience; // e.g., 30
        
        // Judge score: Convert average to percentage (7/10 = 70%) then apply weight (70% × 70% = 49%)
        const judgePercentage = (avgJudgeScore / 10) * 100; // Convert to percentage (0-100)
        const weightedJudgeScore = (judgePercentage * judgeWeightPercentage) / 100; // Apply weight
        
        // Audience score: Participation ratio as percentage applied to audience weight
        // Example: 2/4 voters = 50% participation × 30% weight = 15%
        const audiencePercentage = audienceParticipationRatio * 100; // Convert to percentage
        const weightedAudienceScore = (audiencePercentage * audienceWeightPercentage) / 100;
        


        
        const finalScore = weightedJudgeScore + weightedAudienceScore;

        // Create judge breakdown for progress tracking
        const judgeBreakdown = {};
        Object.keys(judgeScores).forEach(judgeId => {
          const judgeScore = judgeScores[judgeId];
          if (judgeScore.totalScore !== undefined) {
            judgeBreakdown[judgeId] = {
              score: judgeScore.totalScore,
              submittedAt: judgeScore.submittedAt,
              finalized: judgeScore.finalized
            };
          }
        });

        categoryResults.push({
          contestant,
          judgeScore: avgJudgeScore,
          judgePercentage: judgePercentage,
          audienceVotes: rawAudienceVotes,
          totalActiveVoters: totalActiveVoters,
          audienceParticipationRatio: audienceParticipationRatio,
          audiencePercentage: audiencePercentage,
          weightedJudgeScore: weightedJudgeScore,
          weightedAudienceScore: weightedAudienceScore,
          finalScore,
          judgeCount,
          judgeBreakdown
        });
      }

      // Sort by final score
      categoryResults.sort((a, b) => b.finalScore - a.finalScore);

      results[category.id] = {
        category,
        results: categoryResults
      };
    }

    // Get all judges and identify which ones have scored
    const judges = await dataManager.readData('judges');
    const activeJudgeIds = new Set();
    Object.values(scores.judgeScores || {}).forEach(contestantScores => {
      Object.keys(contestantScores).forEach(judgeId => {
        activeJudgeIds.add(judgeId);
      });
    });

    // Create judge information array with names
    const judgeInfo = judges.list.map(judge => ({
      id: judge.id,
      name: judge.name,
      hasScored: activeJudgeIds.has(judge.id)
    }));

    const activeJudgesArray = Array.from(activeJudgeIds).sort();

    res.json({ 
      results, 
      settings: settings.results, 
      activeJudges: activeJudgesArray,
      judges: judgeInfo, // All judges with their names and status
      rawScores: scores.judgeScores // Include raw scores for frontend access
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching results' });
  }
});

router.post('/results/declare-winner', async (req, res) => {
  try {
    const { categoryId, contestantId } = req.body;
    
    if (!categoryId || !contestantId) {
      return res.status(400).json({ message: 'Category ID and Contestant ID are required' });
    }

    const settings = await dataManager.readData('settings');
    
    if (!settings.results) {
      settings.results = { published: false, winners: {} };
    }
    
    if (!settings.results.winners) {
      settings.results.winners = {};
    }
    
    settings.results.winners[categoryId] = {
      contestantId,
      declaredAt: new Date().toISOString()
    };
    
    await dataManager.writeData('settings', settings);
    res.json({ message: 'Winner declared successfully' });
  } catch (error) {
    console.error('Error declaring winner:', error);
    res.status(500).json({ message: 'Error declaring winner' });
  }
});

router.get('/results/export', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    const [scores, contestants, categories, judges, audience, settings] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants'),
      dataManager.readData('categories'),
      dataManager.readData('judges'),
      dataManager.readData('audience'),
      dataManager.readData('settings')
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      event: {
        name: settings.eventName || 'CTRL + ALT + ROCK',
        description: settings.eventDescription || 'Music Competition'
      },
      categories: categories.list || [],
      contestants: contestants.list || [],
      judges: judges.list.map(j => ({
        id: j.id,
        name: j.name,
        expertise: j.expertise,
        email: j.email
        // Don't include password/sensitive data
      })),
      audience: {
        total: audience.list ? audience.list.length : 0,
        // Don't include personal details, just stats
      },
      scores: scores,
      winners: settings.results?.winners || {}
    };

    if (format === 'csv') {
      // Generate CSV format
      let csvData = 'Category,Contestant,Judge Scores,Audience Votes,Final Score,Winner\n';
      
      for (const category of categories.list || []) {
        const categoryContestants = contestants.list?.filter(c => c.categoryId === category.id) || [];
        
        for (const contestant of categoryContestants) {
          const judgeScores = scores.judgeScores[contestant.id] || {};
          const audienceVotes = scores.audienceVotes[contestant.id] || 0;
          const avgJudgeScore = Object.keys(judgeScores).length > 0 ?
            Object.values(judgeScores).reduce((sum, scoresByJudge) => 
              sum + Object.values(scoresByJudge).reduce((a, b) => a + b, 0), 0
            ) / Object.keys(judgeScores).length : 0;
          
          const judgeWeight = (settings.judgeScoreWeight || 70) / 100;
          const audienceWeight = (settings.audienceVoteWeight || 30) / 100;
          const finalScore = (avgJudgeScore * judgeWeight) + (audienceVotes * audienceWeight);
          
          const isWinner = settings.results?.winners?.[category.id]?.contestantId === contestant.id;
          
          csvData += `"${category.name}","${contestant.name}","${avgJudgeScore.toFixed(2)}","${audienceVotes}","${finalScore.toFixed(2)}","${isWinner ? 'Yes' : 'No'}"\n`;
        }
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=voting_results.csv');
      res.send(csvData);
    } else {
      res.json(exportData);
    }
  } catch (error) {
    console.error('Error exporting results:', error);
    res.status(500).json({ message: 'Error exporting results' });
  }
});

router.post('/results/clear-votes', async (req, res) => {
  try {
    // Reset all scores
    const emptyScores = {
      judgeScores: {},
      audienceVotes: {},
      lastUpdated: new Date().toISOString()
    };
    
    await dataManager.writeData('scores', emptyScores);
    
    // Clear winners from settings
    const settings = await dataManager.readData('settings');
    if (settings.results) {
      settings.results.winners = {};
      settings.results.published = false;
      await dataManager.writeData('settings', settings);
    }
    
    res.json({ message: 'All votes cleared successfully' });
  } catch (error) {
    console.error('Error clearing votes:', error);
    res.status(500).json({ message: 'Error clearing votes' });
  }
});

router.post('/results/publish/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { winners } = req.body; // { first: contestantId, second: contestantId, third: contestantId }
    
    const settings = await dataManager.readData('settings');
    
    if (!settings.results.winners) {
      settings.results.winners = {};
    }
    
    settings.results.winners[categoryId] = {
      ...winners,
      publishedAt: new Date().toISOString()
    };
    
    settings.results.published = true;
    
    await dataManager.writeData('settings', settings);
    res.json({ message: 'Results published successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error publishing results' });
  }
});

// Unpublish results
router.post('/results/unpublish', async (req, res) => {
  try {
    const settings = await dataManager.readData('settings');
    
    settings.results.published = false;
    
    await dataManager.writeData('settings', settings);
    res.json({ message: 'Results unpublished successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error unpublishing results' });
  }
});

// Additional AUDIENCE MANAGEMENT routes
router.put('/audience/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, mobile, email, company } = req.body;
    
    if (!dataManager.validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const audience = await dataManager.readData('audience');
    // Ensure audience has proper structure
    if (!audience.list) {
      audience.list = [];
    }
    const memberIndex = audience.list.findIndex(m => m.id === id);
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    // Check if email already exists (excluding current member)
    const existingMember = audience.list.find(m => 
      m.email.toLowerCase() === email.toLowerCase() && m.id !== id
    );
    if (existingMember) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Update member
    audience.list[memberIndex] = {
      ...audience.list[memberIndex],
      firstName,
      lastName,
      mobile,
      email,
      company,
      updatedAt: new Date().toISOString()
    };

    await dataManager.writeData('audience', audience);
    
    const updatedMember = { ...audience.list[memberIndex] };
    delete updatedMember.loginCode;
    delete updatedMember.qrCode;
    
    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating audience member:', error);
    res.status(500).json({ message: 'Error updating audience member' });
  }
});

router.delete('/audience/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await dataManager.readData('audience');
    
    // Ensure audience has proper structure
    if (!audience.list) {
      audience.list = [];
    }
    
    const memberIndex = audience.list.findIndex(m => m.id === id);
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    audience.list.splice(memberIndex, 1);
    await dataManager.writeData('audience', audience);
    
    res.json({ message: 'Audience member deleted successfully' });
  } catch (error) {
    console.error('Error deleting audience member:', error);
    res.status(500).json({ message: 'Error deleting audience member' });
  }
});

// CSV Import for audience
const csvUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

router.post('/audience/csv-import', csvUpload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file provided' });
    }

    const csvData = req.file.buffer.toString('utf-8');
    const results = [];
    const errors = [];
    let imported = 0;

    const audience = await dataManager.readData('audience');
    // Ensure audience has proper structure
    if (!audience.list) {
      audience.list = [];
    }
    const existingEmails = new Set(audience.list.map(m => m.email.toLowerCase()));

    // Parse CSV
    const lines = csvData.split('\n');
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    // Validate headers
    const requiredHeaders = ['firstname', 'lastname', 'email'];
    const hasRequiredHeaders = requiredHeaders.every(h => headers.includes(h));
    
    if (!hasRequiredHeaders) {
      return res.status(400).json({ 
        message: `CSV must contain columns: ${requiredHeaders.join(', ')}. Optional: mobile, company` 
      });
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      if (values.length < headers.length) {
        errors.push(`Row ${i + 1}: Insufficient data`);
        continue;
      }

      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = values[index] || '';
      });

      // Validate required fields
      if (!rowData.firstname || !rowData.lastname || !rowData.email) {
        errors.push(`Row ${i + 1}: Missing required fields (firstname, lastname, email)`);
        continue;
      }

      if (!dataManager.validateEmail(rowData.email)) {
        errors.push(`Row ${i + 1}: Invalid email format`);
        continue;
      }

      if (existingEmails.has(rowData.email.toLowerCase())) {
        errors.push(`Row ${i + 1}: Email already exists`);
        continue;
      }

      // Create new member
      const loginCode = dataManager.generateCode(6);
      const qrResult = await notificationService.generateQRCode(loginCode);
      
      const newMember = {
        id: dataManager.generateId(),
        firstName: rowData.firstname,
        lastName: rowData.lastname,
        mobile: rowData.mobile || '',
        email: rowData.email,
        company: rowData.company || '',
        loginCode,
        qrCode: qrResult.success ? qrResult.qrCode : null,
        createdAt: new Date().toISOString(),
        importedAt: new Date().toISOString()
      };

      audience.list.push(newMember);
      existingEmails.add(rowData.email.toLowerCase());
      imported++;
    }

    await dataManager.writeData('audience', audience);

    res.json({
      message: `Successfully imported ${imported} audience members`,
      imported,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ message: 'Error importing CSV file' });
  }
});

// Send email to specific audience member
router.post('/audience/:id/send-email', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await dataManager.readData('audience');
    
    const member = audience.list.find(m => m.id === id);
    if (!member) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    const emailResult = await notificationService.sendAudienceLogin(member);
    
    if (emailResult.success) {
      // Update email sent timestamp
      const memberIndex = audience.list.findIndex(m => m.id === id);
      audience.list[memberIndex].emailSentAt = new Date().toISOString();
      await dataManager.writeData('audience', audience);
      
      res.json({ message: 'Login code sent successfully' });
    } else {
      res.status(500).json({ message: emailResult.error || 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Error sending email' });
  }
});

// Send emails to all audience members
router.post('/audience/send-all-emails', async (req, res) => {
  try {
    const audience = await dataManager.readData('audience');
    const errors = [];
    let sent = 0;

    // Helper function to add delay between emails
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const member of audience.list) {
      try {
        const emailResult = await notificationService.sendAudienceLogin(member);
        
        if (emailResult.success) {
          // Update email sent timestamp
          const memberIndex = audience.list.findIndex(m => m.id === member.id);
          audience.list[memberIndex].emailSentAt = new Date().toISOString();
          sent++;
        } else {
          errors.push(`${member.email}: ${emailResult.error}`);
        }
      } catch (error) {
        errors.push(`${member.email}: ${error.message}`);
      }

      // Add 2 second delay between each email to avoid rate limiting
      if (sent < audience.list.length) {
        await delay(2000);
      }
    }

    await dataManager.writeData('audience', audience);

    res.json({
      message: `Sent ${sent} emails successfully`,
      sent,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error sending bulk emails:', error);
    res.status(500).json({ message: 'Error sending bulk emails' });
  }
});

// Get QR code for audience member
router.get('/audience/:id/qr-code', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await dataManager.readData('audience');
    
    const member = audience.list.find(m => m.id === id);
    if (!member) {
      return res.status(404).json({ message: 'Audience member not found' });
    }

    // Generate fresh QR code if not exists
    let qrCode = member.qrCode;
    if (!qrCode) {
      const qrResult = await notificationService.generateQRCode(member.loginCode);
      if (qrResult.success) {
        qrCode = qrResult.qrCode;
        // Update member with QR code
        const memberIndex = audience.list.findIndex(m => m.id === id);
        audience.list[memberIndex].qrCode = qrCode;
        await dataManager.writeData('audience', audience);
      }
    }

    res.json({
      loginCode: member.loginCode,
      qrCode: qrCode
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({ message: 'Error generating QR code' });
  }
});

// Regenerate all QR codes with new URL format
router.post('/audience/regenerate-qr-codes', async (req, res) => {
  try {
    console.log('Starting QR code regeneration...');
    const audience = await dataManager.readData('audience');
    console.log(`Found ${audience.list ? audience.list.length : 0} audience members`);
    
    if (!audience.list || audience.list.length === 0) {
      return res.json({ 
        message: 'No audience members found to regenerate QR codes',
        updatedCount: 0 
      });
    }
    
    let updatedCount = 0;
    const errors = [];
    
    for (let member of audience.list) {
      try {
        console.log(`Generating QR for member ${member.id} with code ${member.loginCode}`);
        const qrResult = await notificationService.generateQRCode(member.loginCode);
        if (qrResult.success) {
          member.qrCode = qrResult.qrCode;
          updatedCount++;
          console.log(`✓ QR generated for ${member.firstName} ${member.lastName}`);
        } else {
          errors.push(`Failed for ${member.firstName} ${member.lastName}: ${qrResult.error}`);
          console.error(`✗ QR failed for ${member.firstName} ${member.lastName}:`, qrResult.error);
        }
      } catch (memberError) {
        errors.push(`Error for ${member.firstName} ${member.lastName}: ${memberError.message}`);
        console.error(`✗ Exception for ${member.firstName} ${member.lastName}:`, memberError);
      }
    }
    
    await dataManager.writeData('audience', audience);
    console.log(`QR regeneration complete. Updated: ${updatedCount}, Errors: ${errors.length}`);
    
    res.json({ 
      message: `Successfully regenerated ${updatedCount} QR codes with auto-login URLs`,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error regenerating QR codes:', error);
    res.status(500).json({ 
      message: 'Error regenerating QR codes', 
      error: error.message 
    });
  }
});

// ===============================
// ADMIN USER MANAGEMENT ROUTES
// ===============================

// Get all admin users (except passwords)
router.get('/admin-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminsData = await dataManager.readData('admins');
    
    // Remove passwords from response for security
    const adminsList = adminsData.users.map(user => ({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile,
      image: user.image,
      createdAt: user.createdAt,
      isSuperAdmin: user.username === 'admin' // Mark super admin
    }));

    res.json({
      success: true,
      users: adminsList,
      currentUser: req.user.username
    });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ message: 'Error fetching admin users' });
  }
});

// Create new admin user (only super admin can do this)
router.post('/admin-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Only super admin (username: admin) can create new admin users
    if (req.user.username !== 'admin') {
      return res.status(403).json({ 
        message: 'Only the super administrator can create new admin users' 
      });
    }

    const { username, firstName, lastName, email, mobile } = req.body;

    // Validation (password no longer required - will be auto-generated)
    if (!username || !firstName || !lastName || !email) {
      return res.status(400).json({ 
        message: 'Username, first name, last name, and email are required' 
      });
    }

    const adminsData = await dataManager.readData('admins');

    // Check if username already exists
    const existingUser = adminsData.users.find(user => user.username === username);
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Check if email already exists
    const existingEmail = adminsData.users.find(user => user.email === email);
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Generate secure password (12 characters: uppercase, lowercase, numbers, symbols)
    const generatePassword = () => {
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const numbers = '0123456789';
      const symbols = '!@#$%^&*';
      const allChars = uppercase + lowercase + numbers + symbols;
      
      let password = '';
      // Ensure at least one character from each category
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      password += numbers[Math.floor(Math.random() * numbers.length)];
      password += symbols[Math.floor(Math.random() * symbols.length)];
      
      // Fill remaining 8 characters randomly
      for (let i = 4; i < 12; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
      }
      
      // Shuffle the password
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };

    const generatedPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Generate unique ID
    const newId = `admin${Date.now()}`;

    // Create new admin user
    const newAdmin = {
      id: newId,
      username: username,
      password: hashedPassword,
      firstName: firstName,
      lastName: lastName,
      email: email,
      mobile: mobile || '',
      image: null,
      createdAt: new Date().toISOString()
    };

    // Add to users array
    adminsData.users.push(newAdmin);

    // Save to file
    await dataManager.writeData('admins', adminsData);

    // Send email with credentials
    try {
      await notificationService.sendAdminCredentials({
        firstName,
        lastName,
        username,
        email
      }, generatedPassword);
    } catch (emailError) {
      console.error('Failed to send admin credentials email:', emailError);
      // Continue with success response even if email fails
    }

    // Return success (without password)
    const responseUser = { ...newAdmin };
    delete responseUser.password;

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully and credentials sent via email',
      user: responseUser
    });

  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ message: 'Error creating admin user' });
  }
});

// Update admin user
router.put('/admin-users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, mobile } = req.body;

    const adminsData = await dataManager.readData('admins');
    
    // Find user to update
    const userIndex = adminsData.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const userToUpdate = adminsData.users[userIndex];

    // Permission check: super admin can edit anyone, others can only edit themselves
    if (req.user.username !== 'admin' && userToUpdate.username !== req.user.username) {
      return res.status(403).json({ 
        message: 'You can only edit your own profile' 
      });
    }

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        message: 'First name, last name, and email are required' 
      });
    }

    // Check if email is taken by another user
    const existingEmail = adminsData.users.find(user => user.email === email && user.id !== id);
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Update user data
    adminsData.users[userIndex] = {
      ...userToUpdate,
      firstName: firstName,
      lastName: lastName,
      email: email,
      mobile: mobile || '',
      updatedAt: new Date().toISOString()
    };

    // Save to file
    await dataManager.writeData('admins', adminsData);

    // Return success (without password)
    const responseUser = { ...adminsData.users[userIndex] };
    delete responseUser.password;

    res.json({
      success: true,
      message: 'Admin user updated successfully',
      user: responseUser
    });

  } catch (error) {
    console.error('Error updating admin user:', error);
    res.status(500).json({ message: 'Error updating admin user' });
  }
});

// Delete admin user (only super admin can do this)
router.delete('/admin-users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Only super admin can delete users
    if (req.user.username !== 'admin') {
      return res.status(403).json({ 
        message: 'Only the super administrator can delete admin users' 
      });
    }

    const { id } = req.params;
    const adminsData = await dataManager.readData('admins');

    // Find user to delete
    const userIndex = adminsData.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const userToDelete = adminsData.users[userIndex];

    // Prevent deletion of super admin
    if (userToDelete.username === 'admin') {
      return res.status(403).json({ 
        message: 'Cannot delete the super administrator account' 
      });
    }

    // Remove user from array
    adminsData.users.splice(userIndex, 1);

    // Save to file
    await dataManager.writeData('admins', adminsData);

    res.json({
      success: true,
      message: 'Admin user deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting admin user:', error);
    res.status(500).json({ message: 'Error deleting admin user' });
  }
});

// Change password
router.put('/admin-users/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }

    const adminsData = await dataManager.readData('admins');
    
    // Find user
    const userIndex = adminsData.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const userToUpdate = adminsData.users[userIndex];

    // Permission check: 
    // - Super admin can reset anyone's password (including their own)
    // - Regular admins can only change their own password (not others)
    const isSuperAdmin = req.user.username === 'admin';
    const isOwnAccount = userToUpdate.username === req.user.username;

    if (!isOwnAccount && !isSuperAdmin) {
      return res.status(403).json({ 
        message: 'You can only change your own password. Only the super administrator can reset other users\' passwords.' 
      });
    }

    // If user is changing their own password (and not super admin changing their own), require current password
    if (isOwnAccount && (!isSuperAdmin || req.user.username !== 'admin')) {
      if (!currentPassword) {
        return res.status(400).json({ 
          message: 'Current password is required when changing your own password' 
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userToUpdate.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    adminsData.users[userIndex].password = hashedNewPassword;
    adminsData.users[userIndex].updatedAt = new Date().toISOString();

    // Save to file
    await dataManager.writeData('admins', adminsData);

    res.json({
      success: true,
      message: isSuperAdmin && !isOwnAccount ? 
        'Password reset successfully' : 
        'Password changed successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// Upload profile image
router.post('/admin-users/:id/image', authenticateToken, requireAdmin, multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed'));
    }
  }
}).single('image'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const adminsData = await dataManager.readData('admins');
    
    // Find user
    const userIndex = adminsData.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const userToUpdate = adminsData.users[userIndex];

    // Permission check: super admin can change anyone's image, others can only change their own
    if (req.user.username !== 'admin' && userToUpdate.username !== req.user.username) {
      return res.status(403).json({ 
        message: 'You can only change your own profile image' 
      });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '../uploads/admin-profiles');
    console.log('Upload directory path:', uploadsDir);
    
    try {
      await fs.access(uploadsDir);
      console.log('Directory exists');
    } catch {
      console.log('Creating directory...');
      await fs.mkdir(uploadsDir, { recursive: true });
      console.log('Directory created');
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${id}_${Date.now()}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    
    console.log('Saving file to:', filePath);
    console.log('File buffer size:', req.file.buffer.length);

    // Save file
    await fs.writeFile(filePath, req.file.buffer);
    console.log('File saved successfully');

    // Update user image path
    adminsData.users[userIndex].image = `/uploads/admin-profiles/${fileName}`;
    adminsData.users[userIndex].updatedAt = new Date().toISOString();

    // Save to file
    await dataManager.writeData('admins', adminsData);

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      imagePath: adminsData.users[userIndex].image
    });

  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ message: 'Error uploading profile image' });
  }
});

module.exports = router;