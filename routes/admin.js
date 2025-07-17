const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Apply authentication middleware to all admin routes
router.use(verifyToken);

// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('items.product')
      .lean();
    
    const lowStockProducts = await Product.find({ inStock: false }).limit(5).lean();
    
    res.json({
      stats: {
        totalProducts,
        totalOrders,
        pendingOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
      recentOrders,
      lowStockProducts,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all products for admin
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, featured } = req.query;
    
    const filter = {};
    if (category) filter.category = category;
    if (featured !== undefined) filter.featured = featured === 'true';
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));
    
    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching admin products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get all orders for admin
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('items.product')
      .lean();
    
    const total = await Order.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));
    
    res.json({
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update order status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Pending', 'Dispatched', 'Delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate('items.product');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Get sales analytics
router.get('/analytics/sales', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $in: ['Dispatched', 'Delivered'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          totalSales: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(salesData);
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
});

module.exports = router; 