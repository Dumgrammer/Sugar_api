const mongoose = require('mongoose');

const paymentItemSchema = new mongoose.Schema(
    {
        itemId: { type: String, default: '' },
        name: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const paymentSchema = new mongoose.Schema(
    {
        customerName: {
            type: String,
            required: true,
            trim: true,
        },
        orderNumber: {
            type: String,
            default: '',
            trim: true,
        },
        paymentMethod: {
            type: String,
            enum: ['GCash', 'Maya', 'Bank QR', 'Cash'],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        cart: {
            type: [paymentItemSchema],
            default: [],
        },
        proofImage: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['received', 'preparing', 'ready', 'completed'],
            default: 'received',
        },
        paymentConfirmed: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;

export {};
