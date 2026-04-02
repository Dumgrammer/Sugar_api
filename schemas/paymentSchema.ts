const { z } = require('zod');

const paymentCartItemSchema = z.object({
    itemId: z.string().optional().default(''),
    name: z.string().trim().min(1, 'Item name is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    price: z.number().min(0, 'Price cannot be negative'),
    size: z.enum(['Medium', 'Large']).optional(),
    notes: z.string().trim().optional().default(''),
    addOns: z.array(z.object({
        name: z.string().trim().min(1, 'Add-on name is required'),
        price: z.number().min(0, 'Add-on price cannot be negative'),
    })).optional().default([]),
    lineTotal: z.number().min(0, 'Line total cannot be negative').optional(),
});

const createPaymentSchema = z.object({
    customerName: z.string().trim().min(1, 'Customer name is required'),
    orderNumber: z.string().trim().optional().default(''),
    paymentMethod: z.enum(['GCash', 'Maya', 'Bank QR', 'Cash']),
    amount: z.number().min(0, 'Amount cannot be negative'),
    cart: z.array(paymentCartItemSchema).optional().default([]),
});

const updatePaymentStatusSchema = z.object({
    status: z.enum(['received', 'preparing', 'ready', 'completed']),
});

module.exports = {
    createPaymentSchema,
    updatePaymentStatusSchema,
};

export {};
