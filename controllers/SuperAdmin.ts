import type { Request, Response } from 'express';

const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const SuperAdminModel = require('../models/SuperAdmin');
const { createSuperAdminSchema, loginSuperAdminSchema } = require('../schemas/superAdminSchema');
const { recordAuditLog } = require('../services/audit-log');

exports.createSuperAdmin = async (req: Request, res: Response) => {
    try {
        const parsedBody = createSuperAdminSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const { f_name, m_name, l_name, email, password } = parsedBody.data;
        const normalizedEmail = email.toLowerCase();
        const existingSuperAdmin = await SuperAdminModel.findOne({ email: normalizedEmail });
        if (existingSuperAdmin) {
            return res.status(409).json({ message: 'Email is already in use' });
        }

        const hashedPassword = await argon2.hash(password);
        const superAdmin = new SuperAdminModel({
            f_name,
            m_name,
            l_name,
            email: normalizedEmail,
            password: hashedPassword,
        });
        await superAdmin.save();

        return res.status(201).json({
            message: 'SuperAdmin created successfully',
            superAdmin: {
                _id: superAdmin._id,
                f_name: superAdmin.f_name,
                m_name: superAdmin.m_name,
                l_name: superAdmin.l_name,
                email: superAdmin.email,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create super admin' });
    }
};

exports.loginSuperAdmin = async (req: Request, res: Response) => {
    try {
        const parsedBody = loginSuperAdminSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const { email, password } = parsedBody.data;
        const normalizedEmail = email.toLowerCase();
        const superAdmin = await SuperAdminModel.findOne({ email: normalizedEmail });
        if (!superAdmin) {
            await recordAuditLog({
                req,
                category: 'auth',
                action: 'login_failed',
                summary: `Failed super admin login for ${normalizedEmail}`,
                actorEmail: normalizedEmail,
                actorRole: 'anonymous',
                status: 'failure',
            });
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isPasswordValid = await argon2.verify(superAdmin.password, password);
        if (!isPasswordValid) {
            await recordAuditLog({
                req,
                category: 'auth',
                action: 'login_failed',
                summary: `Failed super admin login for ${normalizedEmail}`,
                actorEmail: normalizedEmail,
                actorRole: 'anonymous',
                status: 'failure',
            });
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ message: 'JWT secret is not configured' });
        }

        const token = jwt.sign(
            {
                sub: superAdmin._id.toString(),
                email: superAdmin.email,
                role: 'super_admin',
            },
            jwtSecret,
            { expiresIn: '7d' }
        );

        const actorName = [superAdmin.f_name, superAdmin.m_name, superAdmin.l_name].filter(Boolean).join(' ');
        await recordAuditLog({
            req,
            category: 'auth',
            action: 'login',
            summary: `Super admin logged in: ${actorName || superAdmin.email}`,
            actorId: superAdmin._id.toString(),
            actorEmail: superAdmin.email,
            actorName,
            actorRole: 'super_admin',
        });

        return res.status(200).json({
            message: 'Login successful',
            token,
            superAdmin: {
                _id: superAdmin._id,
                f_name: superAdmin.f_name,
                m_name: superAdmin.m_name,
                l_name: superAdmin.l_name,
                email: superAdmin.email,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to login super admin' });
    }
};
