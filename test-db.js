const mongoose = require('mongoose');
require('dotenv').config();

// Test database connection
async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  
  // Check if MONGODB_URI is set
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
    process.exit(1);
  }
  
  // Hide sensitive information in URI
  const maskedUri = process.env.MONGODB_URI.replace(
    /:\/\/([^:]+):([^@]+)@/,
    '://[USERNAME]:[PASSWORD]@'
  );
  console.log('📍 MongoDB URI:', maskedUri);
  
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    
    console.log('✅ Successfully connected to MongoDB!');
    console.log('📊 Database:', connection.connection.name);
    console.log('🔗 Host:', connection.connection.host);
    console.log('🔢 Port:', connection.connection.port);
    console.log('📈 Ready State:', connection.connection.readyState);
    
    // Test a simple query
    const collections = await connection.connection.db.listCollections().toArray();
    console.log('📁 Available collections:', collections.map(c => c.name));
    
    // Test Product model
    const Product = require('./models/Product');
    const productCount = await Product.countDocuments();
    console.log('📦 Total products:', productCount);
    
    const activeProducts = await Product.countDocuments({ is_active: true });
    console.log('📦 Active products:', activeProducts);
    
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    // Provide specific error guidance
    if (error.message.includes('ENOTFOUND')) {
      console.error('💡 DNS resolution failed. Check your MongoDB URI.');
    } else if (error.message.includes('authentication')) {
      console.error('💡 Authentication failed. Check your username and password.');
    } else if (error.message.includes('timeout')) {
      console.error('💡 Connection timeout. Check your IP whitelist in MongoDB Atlas.');
    } else {
      console.error('💡 Unknown error. Check MongoDB Atlas cluster status.');
    }
    
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testDatabaseConnection();