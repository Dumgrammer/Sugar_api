const { z } = require('zod');

const createInventorySchema = z.object({
    skuCode: z.string().trim().min(1, 'SKU Code is required'),
    itemName: z.string().trim().min(1, 'Item Name is required'),
    category: z.string().trim().min(1, 'Category is required'),
    unit: z.string().trim().min(1, 'Unit is required'),
    stockQuantity: z.number().min(0, 'Stock Quantity cannot be negative').optional().default(0),
    reorderLevel: z.number().min(0, 'Reorder Level cannot be negative').optional().default(0),
    unitCost: z.number().min(0, 'Unit Cost cannot be negative').optional().default(0),
});

const updateInventorySchema = z.object({
    skuCode: z.string().trim().min(1, 'SKU Code is required').optional(),
    itemName: z.string().trim().min(1, 'Item Name is required').optional(),
    category: z.string().trim().min(1, 'Category is required').optional(),
    unit: z.string().trim().min(1, 'Unit is required').optional(),
    stockQuantity: z.number().min(0, 'Stock Quantity cannot be negative').optional(),
    reorderLevel: z.number().min(0, 'Reorder Level cannot be negative').optional(),
    unitCost: z.number().min(0, 'Unit Cost cannot be negative').optional(),
});

module.exports = {
    createInventorySchema,
    updateInventorySchema,
};

export {};
