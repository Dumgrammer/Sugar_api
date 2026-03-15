import type { Request, Response } from 'express';

const AdminModel = require('../models/Admin');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { createAdminSchema, loginAdminSchema } = require('../schemas/adminSchema');

exports.createAdmin = async (req: Request, res: Response) => {
    try {
        const parsedBody = createAdminSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const { f_name, m_name, l_name, email, password } = parsedBody.data;
        const normalizedEmail = email.toLowerCase();
        const existingAdmin = await AdminModel.findOne({ email: normalizedEmail });
        if (existingAdmin) {
            return res.status(409).json({ message: 'Email is already in use' });
        }

        const hashedPassword = await argon2.hash(password);
        const admin = new AdminModel({
            f_name,
            m_name,
            l_name,
            email: normalizedEmail,
            password: hashedPassword,
        });
        await admin.save();
        res.status(201).json({
            message: 'Admin created successfully',
            admin: {
                _id: admin._id,
                f_name: admin.f_name,
                m_name: admin.m_name,
                l_name: admin.l_name,
                email: admin.email,
            },
        });

    } catch (error) {
        res.status(500).json({ message: 'Failed to create admin' });
    }
}

exports.loginAdmin = async (req: Request, res: Response) => {
    try {
        const parsedBody = loginAdminSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const { email, password } = parsedBody.data;
        const normalizedEmail = email.toLowerCase();
        const admin = await AdminModel.findOne({ email: normalizedEmail });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isPasswordValid = await argon2.verify(admin.password, password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ message: 'JWT secret is not configured' });
        }

        const token = jwt.sign(
            {
                sub: admin._id.toString(),
                email: admin.email,
            },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            admin: {
                _id: admin._id,
                f_name: admin.f_name,
                m_name: admin.m_name,
                l_name: admin.l_name,
                email: admin.email,
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to login admin' });
    }
}
