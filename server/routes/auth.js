const express = require('express');
const bcrypt = require('bcryptjs');
const dataManager = require('../utils/dataManager');
const notificationService = require('../utils/notificationService');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Admin login
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const adminData = await dataManager.readData('admins');
    const admin = adminData.users.find(u => u.username === username);

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({ id: admin.id, type: 'admin', username: admin.username });

    // Remove password from response
    const { password: _, ...adminInfo } = admin;

    res.json({
      message: 'Login successful',
      token,
      user: adminInfo
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Judge login
router.post('/judge/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const judgeData = await dataManager.readData('judges');
    const judge = judgeData.list.find(j => j.username === username);

    if (!judge) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, judge.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({ id: judge.id, type: 'judge', username: judge.username });

    // Remove password from response
    const { password: _, ...judgeInfo } = judge;

    res.json({
      message: 'Login successful',
      token,
      user: judgeInfo
    });

  } catch (error) {
    console.error('Judge login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Audience login with code
router.post('/audience/login', async (req, res) => {
  try {
    const { loginCode } = req.body;

    if (!loginCode) {
      return res.status(400).json({ message: 'Login code is required' });
    }

    const audienceData = await dataManager.readData('audience');
    const audience = audienceData.list.find(a => a.loginCode === loginCode.toUpperCase());

    if (!audience) {
      return res.status(401).json({ message: 'Invalid login code' });
    }

    // Check if user already has an active session
    if (audience.activeSession && audience.activeSession !== req.sessionID) {
      // Update to new session
      audience.activeSession = req.sessionID;
      await dataManager.writeData('audience', audienceData);
    } else if (!audience.activeSession) {
      audience.activeSession = req.sessionID;
      await dataManager.writeData('audience', audienceData);
    }

    const token = generateToken({ id: audience.id, type: 'audience', loginCode: audience.loginCode });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: audience.id,
        firstName: audience.firstName,
        lastName: audience.lastName,
        company: audience.company,
        loginCode: audience.loginCode
      }
    });

  } catch (error) {
    console.error('Audience login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Forgot login code - send email
router.post('/audience/forgot-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!dataManager.validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const audienceData = await dataManager.readData('audience');
    const audience = audienceData.list.find(a => a.email.toLowerCase() === email.toLowerCase());

    if (!audience) {
      return res.status(404).json({ message: 'Email not found in our records' });
    }

    // Send email with login code
    const emailResult = await notificationService.sendLoginCode(
      audience.email,
      audience.loginCode,
      `${audience.firstName} ${audience.lastName}`
    );

    if (emailResult.success) {
      res.json({ message: 'Login code sent to your email successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send email. Please contact support.' });
    }

  } catch (error) {
    console.error('Forgot code error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get splash screen image
router.get('/splash-image', (req, res) => {
  // Return the splash screen image
  res.json({ 
    image: '/uploads/images/splash.jpg',
    fallback: false 
  });
});

module.exports = router;