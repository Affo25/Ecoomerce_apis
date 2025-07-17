const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// Get all orders (admin only)
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
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
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product')
      .lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create new order
router.post('/', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product')
      .lean();
    
    res.status(201).json(populatedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Update order status (admin only)
router.patch('/:id/status', async (req, res) => {
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

// Get order statistics (admin only)
router.get('/stats/summary', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const dispatchedOrders = await Order.countDocuments({ status: 'Dispatched' });
    const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });
    
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    res.json({
      totalOrders,
      pendingOrders,
      dispatchedOrders,
      deliveredOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

module.exports = router; 