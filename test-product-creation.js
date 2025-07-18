const mongoose = require('mongoose');
require('dotenv').config();

// Test product creation
async function testProductCreation() {
  console.log('🧪 Testing product creation...');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Import Product model
    const Product = require('./models/Product');
    
    // Create a simple test product
    const testProduct = {
      name: 'Test Product',
      slug: 'test-product-' + Date.now(),
      price: 29.99,
      description: 'This is a test product',
      short_description: 'Test product description',
      quantity_in_stock: 10,
      stock_status: 'in_stock',
      currency: 'USD',
      is_active: true,
      featured: false,
      categories: ['test'],
      tags: ['test-tag'],
      attributes: [{ attribute_name: 'Color', attribute_value: 'Red' }],
      dimensions: { length: 10, width: 5, height: 2 }
    };
    
    console.log('📝 Creating test product:', testProduct.name);
    
    // Create the product
    const product = new Product(testProduct);
    await product.save();
    
    console.log('✅ Product created successfully!');
    console.log('📦 Product ID:', product._id);
    console.log('📦 Product Name:', product.name);
    console.log('📦 Product Slug:', product.slug);
    
    // Test fetching the product
    const fetchedProduct = await Product.findById(product._id);
    console.log('✅ Product fetched successfully!');
    
    // Clean up - delete the test product
    await Product.findByIdAndDelete(product._id);
    console.log('🧹 Test product deleted');
    
    console.log('✅ All product tests passed!');
    
  } catch (error) {
    console.error('❌ Product creation test failed:', error);
    
    // Provide specific error information
    if (error.name === 'ValidationError') {
      console.error('🚨 Validation errors:');
      Object.values(error.errors).forEach(err => {
        console.error(`  - ${err.path}: ${err.message}`);
      });
    }
    
    if (error.code === 11000) {
      console.error('🚨 Duplicate key error:', error.keyValue);
    }
    
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testProductCreation();