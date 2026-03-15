import type { NextFunction, Request, Response } from 'express';

const jwt = require('jsonwebtoken');

type JwtPayload = {
    sub: string;
    email: string;
    role?: string;
};

exports.requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization token is required' });
    }

    const token = authHeader.slice(7);
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        return res.status(500).json({ message: 'JWT secret is not configured' });
    }

    try {
        const payload = jwt.verify(token, jwtSecret) as JwtPayload;
        if (payload.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only super admin can perform this action' });
        }

        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
