const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();
const serverless = require('serverless-http');

const app = express();

// Environment validation
const requiredEnvVars = ['MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Middleware
app.use(helmet());

// CORS configuration for production and development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3000',
      'https://your-admin-domain.vercel.app', // Replace with your actual admin domain
      'https://your-client-domain.vercel.app', // Replace with your actual client domain
    ];
    
    // In production, also allow your deployed domains
    if (process.env.NODE_ENV === 'production') {
      // Add your production domains here
      allowedOrigins.push(
        process.env.ADMIN_URL || 'https://your-admin-domain.vercel.app',
        process.env.CLIENT_URL || 'https://your-client-domain.vercel.app'
      );
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// MongoDB connection - optimized for serverless
let isConnected = false;

const connectDB = async () => {
  try {
    if (isConnected && mongoose.connection.readyState === 1) {
      return;
    }

    if (mongoose.connection.readyState !== 1) {
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        bufferCommands: false,
        bufferMaxEntries: 0,
      };

      // Add additional options for production
      if (process.env.NODE_ENV === 'production') {
        options.maxPoolSize = 1; // Optimize for serverless
        options.serverSelectionTimeoutMS = 3000; // Reduce timeout
        options.socketTimeoutMS = 15000; // Reduce timeout
      }

      await mongoose.connect(process.env.MONGODB_URI, options);
      isConnected = true;
      console.log('✅ Connected to MongoDB');
    }
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    isConnected = false;
    
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
    
    // In production, throw the error to be handled by the route
    throw err;
  }
};

// Connect to database
connectDB().catch(console.error);

// Middleware to ensure database connection for each request (serverless)
const ensureDbConnection = async (req, res, next) => {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(503).json({ 
      success: false,
      message: 'Database connection failed',
      data: null
    });
  }
};

// Serve static files from admin images directory
app.use('/images', express.static(path.join(__dirname, '../admin/images')));

// Routes with database connection middleware
app.use('/api/products', ensureDbConnection, require('./routes/products'));
app.use('/api/orders', ensureDbConnection, require('./routes/orders'));
app.use('/api/admin', ensureDbConnection, require('./routes/admin'));
app.use('/api/auth', ensureDbConnection, require('./routes/auth'));

// Health check
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation Error',
      details: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// Local dev server
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5009;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
module.exports.handler = serverless(app);
