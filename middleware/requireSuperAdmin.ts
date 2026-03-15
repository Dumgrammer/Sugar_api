import type { NextFunction, Request, Response } from 'express';

const jwt = require('jsonwebtoken');

type JwtPayload = {
    sub: string;
    email: string;
    role?: string;
};

function getBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice(7);
}

function verifyToken(token: string): JwtPayload | null {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    try {
        return jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (error) {
        return null;
    }
}

exports.requireAdminOrSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ message: 'Authorization token is required' });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Backward compatibility: older admin tokens may not include role yet.
    if (!payload.role || payload.role === 'admin' || payload.role === 'super_admin') {
        return next();
    }

    return res.status(403).json({ message: 'Insufficient role for this action' });
};

exports.requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ message: 'Authorization token is required' });
    }

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
