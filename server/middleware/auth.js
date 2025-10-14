const jwt = require('jsonwebtoken');
const dataManager = require('../utils/dataManager');

const JWT_SECRET = 'ctrl-alt-rock-jwt-secret';

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  if (req.user.type !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Middleware to check if user is judge
const requireJudge = async (req, res, next) => {
  if (req.user.type !== 'judge') {
    return res.status(403).json({ message: 'Judge access required' });
  }
  next();
};

// Middleware to check if user is audience
const requireAudience = async (req, res, next) => {
  if (req.user.type !== 'audience') {
    return res.status(403).json({ message: 'Audience access required' });
  }
  next();
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      type: user.type, 
      username: user.username || user.email || user.loginCode 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Middleware to handle audience session management (one active session)
const manageAudienceSession = async (req, res, next) => {
  if (req.user && req.user.type === 'audience') {
    try {
      const audienceData = await dataManager.readData('audience');
      const user = audienceData.list.find(u => u.id === req.user.id);
      
      if (user && user.activeSession && user.activeSession !== req.sessionID) {
        // Invalidate previous session
        user.activeSession = req.sessionID;
        await dataManager.writeData('audience', audienceData);
      }
    } catch (error) {
      console.error('Session management error:', error);
    }
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireJudge,
  requireAudience,
  generateToken,
  manageAudienceSession,
  JWT_SECRET
};