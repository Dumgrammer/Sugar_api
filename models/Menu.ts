const mongoose = require('mongoose');

const availabilityTimeSchema = new mongoose.Schema(
    {
        mode: {
            type: String,
            enum: ['anytime', 'period'],
            default: 'anytime',
            required: true,
        },
        startTime: {
            type: String,
            default: null,
        },
        endTime: {
            type: String,
            default: null,
        },
    },
    { _id: false }
);

const menuSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        category: {
            type: String,
            enum: ['coffee', 'milk-tea', 'desserts', 'snacks'],
            required: true,
        },
        image: {
            type: String,
            default: '',
        },
        available: {
            type: Boolean,
            default: true,
        },
        stock: {
            type: Number,
            default: 0,
            min: 0,
        },
        availabilityTime: {
            type: availabilityTimeSchema,
            default: { mode: 'anytime', startTime: null, endTime: null },
        },
    },
    { timestamps: true }
);

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;

export {};
