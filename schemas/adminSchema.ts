const { z } = require('zod');

const createAdminSchema = z.object({
    f_name: z.string().trim().min(2, 'First name is required'),
    m_name: z.string().trim().min(1, 'Middle name is required'),
    l_name: z.string().trim().min(2, 'Last name is required'),
    email: z.string().trim().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const loginAdminSchema = z.object({
    email: z.string().trim().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

module.exports = {
    createAdminSchema,
    loginAdminSchema,
};

export {};
