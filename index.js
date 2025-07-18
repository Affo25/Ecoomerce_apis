const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const serverless = require('serverless-http');
require('dotenv').config();

const app = express();

// Environment validation
const requiredEnvVars = ['MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3000',
      'https://localhost:3001',
      'https://localhost:3000',
      process.env.ADMIN_URL,
      process.env.CLIENT_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
    ].filter(Boolean);
    
    // Also allow any vercel.app domain
    if (origin && origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log the origin for debugging
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins in production for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - more lenient for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased limit
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || req.path === '/api/test';
  }
});
app.use(limiter);

// MongoDB connection cache for serverless
let cachedConnection = null;

const connectDB = async () => {
  try {
    if (cachedConnection && mongoose.connection.readyState === 1) {
      return cachedConnection;
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    const options = {
      maxPoolSize: 1, // Optimize for serverless
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 15000,
      bufferCommands: false,
      bufferMaxEntries: 0
    };

    console.log('🔄 Connecting to MongoDB...');
    
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    cachedConnection = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log('✅ Connected to MongoDB successfully');
    
    return cachedConnection;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    cachedConnection = null;
    throw err;
  }
};

// Middleware to ensure database connection
const ensureDbConnection = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    
    let errorMessage = 'Database connection failed';
    if (error.message.includes('ENOTFOUND')) {
      errorMessage = 'Database server not found';
    } else if (error.message.includes('authentication')) {
      errorMessage = 'Database authentication failed';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Database connection timeout';
    }
    
    res.status(503).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
};

// Placeholder image endpoint
app.get('/api/placeholder/:width/:height', (req, res) => {
  const { width, height } = req.params;
  const w = parseInt(width) || 64;
  const h = parseInt(height) || 64;
  
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="#E5E7EB"/>
      <rect x="${w/4}" y="${h/4}" width="${w/2}" height="${h/2}" rx="4" fill="#9CA3AF"/>
      <circle cx="${w/2}" cy="${h/2 - h/8}" r="${h/12}" fill="#6B7280"/>
      <path d="M${w/2 - w/8} ${h/2 + h/16} L${w/2} ${h/2 - h/16} L${w/2 + w/8} ${h/2 + h/16} L${w/2 + w/16} ${h/2 + h/8} L${w/2 - w/16} ${h/2 + h/8} Z" fill="#6B7280"/>
    </svg>
  `;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

// Health check - no database connection needed
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'OK',
    message: 'Server is running',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    vercel: process.env.VERCEL || false
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working correctly',
    data: {
      timestamp: new Date().toISOString(),
      method: req.method,
      environment: process.env.NODE_ENV || 'development',
      vercel: process.env.VERCEL || false
    }
  });
});

// Routes with database connection middleware
app.use('/api/products', ensureDbConnection, require('./routes/products'));
app.use('/api/orders', ensureDbConnection, require('./routes/orders'));
app.use('/api/admin', ensureDbConnection, require('./routes/admin'));
app.use('/api/auth', ensureDbConnection, require('./routes/auth'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5009;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = serverless(app);