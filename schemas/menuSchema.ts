const { z } = require('zod');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const availabilityTimeSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('anytime'),
    }),
    z.object({
        mode: z.literal('period'),
        startTime: z.string().regex(timeRegex, 'startTime must be in HH:mm format'),
        endTime: z.string().regex(timeRegex, 'endTime must be in HH:mm format'),
    }),
]);

const createMenuSchema = z.object({
    name: z.string().trim().min(1, 'Product name is required'),
    description: z.string().trim().min(1, 'Description is required'),
    price: z.number().min(0, 'Price cannot be negative'),
    category: z.enum(['coffee', 'milk-tea', 'desserts', 'snacks']),
    image: z.string().trim().optional().default(''),
    available: z.boolean().optional().default(true),
    availabilityTime: availabilityTimeSchema.optional().default({ mode: 'anytime' }),
});

const updateMenuSchema = z.object({
    name: z.string().trim().min(1, 'Product name is required').optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    price: z.number().min(0, 'Price cannot be negative').optional(),
    category: z.enum(['coffee', 'milk-tea', 'desserts', 'snacks']).optional(),
    image: z.string().trim().optional(),
    available: z.boolean().optional(),
    availabilityTime: availabilityTimeSchema.optional(),
});

module.exports = {
    createMenuSchema,
    updateMenuSchema,
};

export {};
