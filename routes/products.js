const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

// Import Cloudinary configuration
const { uploadToCloudinary, deleteFromCloudinary, getOptimizedImageUrl } = require('../config/cloudinary');

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
        cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME,
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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
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
      maxPrice,
      search
    } = req.query;

    // Build filter object
    const filter = { is_active: true }; // Only show active products

    // Apply filters
    if (category && category !== 'all') {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'price-low':
        sortObj = { price: 1 };
        break;
      case 'price-high':
        sortObj = { price: -1 };
        break;
      case 'name':
        sortObj = { name: 1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
        break;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
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
        }
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
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
        message: 'Product not found'
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
      error: error.message
    });
  }
});

// Create new product
router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const productData = req.body;
    
    // Handle image uploads
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      console.log(`Uploading ${req.files.length} images to Cloudinary...`);
      
      for (const file of req.files) {
        try {
          const result = await uploadToCloudinary(file, 'products');
          imageUrls.push(result.url);
          console.log(`Image uploaded: ${result.url}`);
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
          // Continue with other images if one fails
        }
      }
    }

    // Create product with uploaded image URLs
    const product = new Product({
      ...productData,
      images: imageUrls,
      is_active: true
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// Update product
router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    const productData = req.body;
    const existingProduct = await Product.findById(req.params.id);
    
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle new image uploads
    const imageUrls = [...(existingProduct.images || [])];
    
    if (req.files && req.files.length > 0) {
      console.log(`Uploading ${req.files.length} new images to Cloudinary...`);
      
      for (const file of req.files) {
        try {
          const result = await uploadToCloudinary(file, 'products');
          imageUrls.push(result.url);
          console.log(`Image uploaded: ${result.url}`);
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
        }
      }
    }

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        ...productData,
        images: imageUrls
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      for (const imageUrl of product.images) {
        try {
          // Extract public_id from Cloudinary URL
          const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
          await deleteFromCloudinary(publicId);
          console.log(`Deleted image: ${publicId}`);
        } catch (deleteError) {
          console.error('Error deleting image from Cloudinary:', deleteError);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// Get product categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { is_active: true });
    
    res.json({
      success: true,
      message: 'Categories fetched successfully',
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// Update product status
router.patch('/:id/status', async (req, res) => {
  try {
    const { is_active } = req.body;
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { is_active },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product status updated successfully',
      data: product
    });
  } catch (error) {
    console.error('Error updating product status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product status',
      error: error.message
    });
  }
});

// Add featured products endpoint
router.get('/featured/list', async (req, res) => {
  try {
    const featuredProducts = await Product.find({ 
      is_active: true,
      featured: true 
    })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

    res.json({
      success: true,
      message: 'Featured products fetched successfully',
      data: featuredProducts
    });
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured products',
      error: error.message
    });
  }
});

module.exports = router;