const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
    {
        skuCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        itemName: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        unit: {
            type: String,
            required: true,
            trim: true,
        },
        stockQuantity: {
            type: Number,
            min: 0,
            default: 0,
        },
        reorderLevel: {
            type: Number,
            min: 0,
            default: 0,
        },
        unitCost: {
            type: Number,
            min: 0,
            default: 0,
        },
    },
    { timestamps: true }
);

inventorySchema.index({ category: 1, itemName: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;

export {};
