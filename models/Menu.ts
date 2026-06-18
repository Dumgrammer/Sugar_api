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

const menuRecipeItemSchema = new mongoose.Schema(
    {
        inventory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Inventory',
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 0,
        },
        size: {
            type: String,
            enum: ['Medium', 'Large', 'any'],
            default: 'any',
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
        availabilityTime: {
            type: availabilityTimeSchema,
            default: { mode: 'anytime', startTime: null, endTime: null },
        },
        recipe: {
            type: [menuRecipeItemSchema],
            default: [],
        },
    },
    { timestamps: true }
);

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;

export {};
