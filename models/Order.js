const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  size: {
    type: String,
    required: true,
  },
  color: {
    type: String,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
});

const orderSchema = new mongoose.Schema({
  customer: {
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
      required: true,
    },
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    default: 'Cash on Delivery',
  },
  status: {
    type: String,
    enum: ['Pending', 'Dispatched', 'Delivered'],
    default: 'Pending',
  },
  orderNumber: {
    type: String,
    unique: true,
  },
}, {
  timestamps: true,
});

// Generate order number before saving
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${Date.now()}-${count + 1}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema); 