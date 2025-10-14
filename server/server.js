const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const judgeRoutes = require('./routes/judge');
const audienceRoutes = require('./routes/audience');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:3000', 
  'http://localhost:3001',
  process.env.CLIENT_URL
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost and deployment domains
    if (allowedOrigins.includes(origin) || 
        origin?.includes('.netlify.app') || 
        origin?.includes('.railway.app') ||
        origin?.includes('localhost')) {
      return callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session configuration
app.use(session({
  secret: 'ctrl-alt-rock-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize data files
const initializeDataFiles = async () => {
  const dataDir = path.join(__dirname, 'data');
  
  const defaultData = {
    admins: {
      users: [
        {
          id: 'admin1',
          username: 'admin',
          password: await bcrypt.hash('intel@123', 10),
          firstName: 'System',
          lastName: 'Administrator',
          mobile: '',
          email: 'admin@ctrlaltrock.com',
          image: null,
          createdAt: new Date().toISOString()
        }
      ]
    },
    categories: {
      list: [
        {
          id: 'cat1',
          name: 'Band',
          image: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'cat2',
          name: 'Singing',
          image: null,
          createdAt: new Date().toISOString()
        }
      ]
    },
    contestants: {
      list: []
    },
    judges: {
      list: [
        {
          id: 'judge1',
          name: 'Alex Johnson',
          username: 'judge1',
          password: await bcrypt.hash('judge123', 10),
          description: 'Professional music producer with 10+ years experience',
          image: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'judge2',
          name: 'Sarah Williams',
          username: 'judge2',
          password: await bcrypt.hash('judge456', 10),
          description: 'Award-winning vocalist and music educator',
          image: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'judge3',
          name: 'Mike Rodriguez',
          username: 'judge3',
          password: await bcrypt.hash('judge789', 10),
          description: 'Lead guitarist and band coach for 15 years',
          image: null,
          createdAt: new Date().toISOString()
        }
      ]
    },
    audience: {
      list: [
        {
          id: 'aud1',
          firstName: 'John',
          lastName: 'Doe',
          mobile: '+1234567890',
          email: 'john.doe@example.com',
          company: 'Tech Corp',
          loginCode: 'ABC123',
          qrCode: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'aud2',
          firstName: 'Jane',
          lastName: 'Smith',
          mobile: '+1987654321',
          email: 'jane.smith@example.com',
          company: 'Design Studio',
          loginCode: 'XYZ789',
          qrCode: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'aud3',
          firstName: 'Bob',
          lastName: 'Johnson',
          mobile: '+1122334455',
          email: 'bob.johnson@example.com',
          company: 'Music Inc',
          loginCode: 'DEF456',
          qrCode: null,
          createdAt: new Date().toISOString()
        }
      ]
    },
    judgingCriteria: {
      categories: {}
    },
    scores: {
      judgeScores: {},
      audienceVotes: {}
    },
    settings: {
      votingOpen: false,
      scoreWeights: {
        judges: 70,
        audience: 30
      },
      results: {
        published: false,
        winners: {}
      }
    }
  };

  // Create data files if they don't exist
  for (const [filename, data] of Object.entries(defaultData)) {
    const filePath = path.join(dataDir, `${filename}.json`);
    try {
      await fs.access(filePath);
    } catch (error) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }
  }
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/judge', judgeRoutes);
app.use('/api/audience', audienceRoutes);

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initializeDataFiles();
  console.log('📁 Data files initialized');
});

module.exports = app;