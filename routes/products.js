const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');

// Debug endpoint to test database connection and products
router.get('/debug', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const productCount = await Product.countDocuments();
    const activeProductCount = await Product.countDocuments({ is_active: true });
    
    res.json({
      success: true,
      message: 'Debug info',
      data: {
        database: dbStatus,
        environment: process.env.NODE_ENV || 'development',
        totalProducts: productCount,
        activeProducts: activeProductCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});

// Set up multer storage - use memory storage for production
const fs = require('fs');

// Helper function to upload to cloud storage (for production)
const uploadToCloudStorage = async (file) => {
  try {
    // For production, you should implement cloud storage here
    
    // Option 1: Cloudinary (recommended)
    if (process.env.CLOUDINARY_URL) {
      const cloudinary = require('cloudinary').v2;
      
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { 
            resource_type: 'image',
            folder: 'products',
            public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        ).end(file.buffer);
      });
    }
    
    // Option 2: Base64 encode and store in database (not recommended for large files)
    // const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    // return base64Image;
    
    // Fallback: Return placeholder (you need to implement actual cloud storage)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    return `/images/${uniqueSuffix}-${file.originalname}`;
    
  } catch (error) {
    console.error('Cloud storage upload error:', error);
    throw error;
  }
};

// For production, we'll use memory storage and upload to cloud storage
// For local development, we'll use disk storage
const storage = process.env.NODE_ENV === 'production' 
  ? multer.memoryStorage() // Store in memory for production
  : multer.diskStorage({
      destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../images/');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: function (req, file, cb) {
        // Save with original name + timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    });

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10 // Maximum 10 files
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Get all products with filtering and pagination
router.get('/', async (req, res) => {
  try {
    // Ensure database connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }

    const {
      category,
      page = 1,
      limit = 12,
      sort = 'newest',
      minPrice,
      maxPrice
    } = req.query;

    // Build filter object
    const filter = { is_active: true }; // Only show active products
    if (category) filter.categories = { $in: [category] }; // Fixed: categories is an array
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'price-low':
        sortObj.price = 1;
        break;
      case 'price-high':
        sortObj.price = -1;
        break;
      case 'newest':
      default:
        sortObj.created_at = -1;
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Products fetched successfully',
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    
    // More specific error handling
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        success: false,
        message: 'Database connection error',
        data: null
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Failed to fetch products' : error.message,
      data: null
    });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found',
        data: null
      });
    }
    
    res.json({
      success: true,
      message: 'Product fetched successfully',
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch product',
      data: null
    });
  }
});

// Create new product (admin only) with multiple image upload
router.post('/', (req, res) => {
  upload.array('images', 10)(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum 5MB per image.',
            data: null
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 10 images allowed.',
            data: null
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
          data: null
        });
      }
      
      return res.status(400).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    
    try {
      // req.body will have text fields, req.files will have the images
      const productData = req.body;
      
      // Parse JSON fields that were stringified in FormData
      const fieldsToParseJSON = ['categories', 'tags', 'dimensions', 'attributes', 'meta_keywords', 'videos'];
      fieldsToParseJSON.forEach(field => {
        if (productData[field]) {
          try {
            productData[field] = JSON.parse(productData[field]);
          } catch (e) {
            console.warn(`Failed to parse ${field}:`, e);
          }
        }
      });

      // Convert string booleans to actual booleans
      if (productData.featured === 'true') productData.featured = true;
      if (productData.featured === 'false') productData.featured = false;
      if (productData.is_active === 'true') productData.is_active = true;
      if (productData.is_active === 'false') productData.is_active = false;

      // Handle uploaded images
      if (req.files && req.files.length > 0) {
        console.log(`📸 Processing ${req.files.length} uploaded files...`);
        console.log('Files info:', req.files.map(f => ({ filename: f.filename, path: f.path, size: f.size })));
        
        if (process.env.NODE_ENV === 'production') {
          // For production, upload to cloud storage
          const imageUrls = await Promise.all(
            req.files.map(file => uploadToCloudStorage(file))
          );
          productData.images = imageUrls;
        } else {
          // For local development, use local file paths
          productData.images = req.files.map(file => `/images/${file.filename}`);
        }
        console.log(`📸 Uploaded ${req.files.length} images:`, productData.images);
      } else {
        console.log('📸 No files uploaded');
      }

      const product = new Product(productData);
      await product.save();
      res.status(201).json({
        success: true,
        message: `Product created successfully with ${req.files ? req.files.length : 0} images`,
        data: product
      });
    } catch (error) {
      console.error('Error creating product:', error);
      
      // Provide more specific error information
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
          success: false,
          message: 'Validation failed',
          data: { details: validationErrors }
        });
      }
      
      if (error.code === 11000) {
        return res.status(400).json({ 
          success: false,
          message: 'Product with this slug already exists',
          data: null
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: 'Failed to create product',
        data: null
      });
    }
  });
});

// Update product (admin only) with multiple image upload
router.put('/:id', (req, res) => {
  upload.array('images', 10)(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum 5MB per image.',
            data: null
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 10 images allowed.',
            data: null
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
          data: null
        });
      }
      
      return res.status(400).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    
    try {
      const productData = req.body;
      
      // Parse JSON fields that were stringified in FormData
      const fieldsToParseJSON = ['categories', 'tags', 'dimensions', 'attributes', 'meta_keywords', 'videos'];
      fieldsToParseJSON.forEach(field => {
        if (productData[field]) {
          try {
            productData[field] = JSON.parse(productData[field]);
          } catch (e) {
            console.warn(`Failed to parse ${field}:`, e);
          }
        }
      });

      // Convert string booleans to actual booleans
      if (productData.featured === 'true') productData.featured = true;
      if (productData.featured === 'false') productData.featured = false;
      if (productData.is_active === 'true') productData.is_active = true;
      if (productData.is_active === 'false') productData.is_active = false;

      // Handle new uploaded images
      if (req.files && req.files.length > 0) {
        console.log(`📸 Processing ${req.files.length} uploaded files for update...`);
        console.log('Files info:', req.files.map(f => ({ filename: f.filename, path: f.path, size: f.size })));
        
        if (process.env.NODE_ENV === 'production') {
          // For production, upload to cloud storage
          const newImages = await Promise.all(
            req.files.map(file => uploadToCloudStorage(file))
          );
          productData.images = newImages;
        } else {
          // For local development, use local file paths
          const newImages = req.files.map(file => `/images/${file.filename}`);
          productData.images = newImages;
        }
        console.log(`📸 Updated with ${req.files.length} new images:`, productData.images);
      } else {
        console.log('📸 No new files uploaded for update');
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        productData,
        { new: true, runValidators: true }
      );
      
      if (!product) {
        return res.status(404).json({ 
          success: false,
          message: 'Product not found',
          data: null
        });
      }
      
      res.json({
        success: true,
        message: `Product updated successfully${req.files ? ` with ${req.files.length} new images` : ''}`,
        data: product
      });
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to update product',
        data: null
      });
    }
  });
});

// Delete product (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found',
        data: null
      });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: null
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete product',
      data: null
    });
  }
});

module.exports = router; 