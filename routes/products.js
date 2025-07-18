const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const path = require('path');

// Set up multer storage - save to admin project images folder
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../admin/images/'));
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
    const {
      category,
      page = 1,
      limit = 12,
      sort = 'newest',
      minPrice,
      maxPrice
    } = req.query;

    // Build filter object
    const filter = {};
    if (category) filter.category = category;
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
        sortObj.createdAt = -1;
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
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch products',
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
        // Store image paths relative to server root for serving
        productData.images = req.files.map(file => `/images/${file.filename}`);
        console.log(`📸 Uploaded ${req.files.length} images:`, productData.images);
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
        // Store image paths relative to server root for serving
        const newImages = req.files.map(file => `/images/${file.filename}`);
        // Replace existing images with new ones (you can modify this logic as needed)
        productData.images = newImages;
        console.log(`📸 Updated with ${req.files.length} new images:`, productData.images);
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