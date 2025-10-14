const jwt = require('jsonwebtoken');
const dataManager = require('../utils/dataManager');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Azure Functions authentication middleware
const authenticateToken = async (context, req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return {
      status: 401,
      body: { message: 'Access token required' }
    };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return {
      status: 200,
      body: { message: 'Token valid' }
    };
  } catch (error) {
    return {
      status: 403,
      body: { message: 'Invalid or expired token' }
    };
  }
};

// Check if user is admin
const requireAdmin = async (context, req) => {
  if (req.user.role !== 'admin') {
    return {
      status: 403,
      body: { message: 'Admin access required' }
    };
  }
  return {
    status: 200,
    body: { message: 'Admin access granted' }
  };
};

// Check if user is judge
const requireJudge = async (context, req) => {
  if (req.user.role !== 'judge') {
    return {
      status: 403,
      body: { message: 'Judge access required' }
    };
  }
  return {
    status: 200,
    body: { message: 'Judge access granted' }
  };
};

// Check if user is audience
const requireAudience = async (context, req) => {
  if (req.user.role !== 'audience') {
    return {
      status: 403,
      body: { message: 'Audience access required' }
    };
  }
  return {
    status: 200,
    body: { message: 'Audience access granted' }
  };
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      role: user.role, 
      username: user.username || user.email || user.loginCode 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Handle audience session management for Azure Functions
const manageAudienceSession = async (context, req) => {
  if (req.user && req.user.role === 'audience') {
    try {
      const audienceData = await dataManager.readData('audience');
      const user = audienceData.find(u => u.id === req.user.id);
      
      if (user && user.activeSession && user.activeSession !== req.sessionID) {
        // Invalidate previous session
        user.activeSession = req.sessionID;
        await dataManager.writeData('audience', audienceData);
      }
    } catch (error) {
      context.log.error('Session management error:', error);
    }
  }
  return {
    status: 200,
    body: { message: 'Session managed' }
  };
};

module.exports = authenticateToken;