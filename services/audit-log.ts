import type { Request } from 'express';

const jwt = require('jsonwebtoken');
const AuditLogModel = require('../models/AuditLog');

export type AuditCategory = 'auth' | 'transaction' | 'inventory' | 'menu' | 'order' | 'user' | 'system' | 'report';
export type AuditActorRole = 'admin' | 'super_admin' | 'customer' | 'system' | 'anonymous';
export type AuditStatus = 'success' | 'failure';

export type AuditActor = {
    actorId?: string | null;
    actorEmail?: string | null;
    actorName?: string | null;
    actorRole?: AuditActorRole;
};

export type RecordAuditInput = AuditActor & {
    req?: Request;
    category: AuditCategory;
    action: string;
    summary: string;
    entityType?: string | null;
    entityId?: string | null;
    details?: Record<string, unknown> | null;
    status?: AuditStatus;
};

type JwtPayload = {
    sub?: string;
    email?: string;
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
    } catch {
        return null;
    }
}

function getClientIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
        return forwarded[0].split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? null;
}

export function getActorFromRequest(req: Request): AuditActor {
    const token = getBearerToken(req);
    if (!token) {
        return { actorRole: 'anonymous' };
    }

    const payload = verifyToken(token);
    if (!payload) {
        return { actorRole: 'anonymous' };
    }

    const role: AuditActorRole =
        payload.role === 'super_admin'
            ? 'super_admin'
            : payload.role === 'admin'
              ? 'admin'
              : 'anonymous';

    return {
        actorId: payload.sub ?? null,
        actorEmail: payload.email ?? null,
        actorRole: role,
    };
}

function sanitizeDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!details) return null;

    const blocked = new Set(['password', 'token', 'proofImage']);
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
        if (blocked.has(key)) continue;
        if (value === undefined) continue;
        sanitized[key] = value;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export async function recordAuditLog(input: RecordAuditInput): Promise<void> {
    try {
        const requestActor = input.req ? getActorFromRequest(input.req) : {};
        const ipAddress = input.req ? getClientIp(input.req) : null;
        const userAgent = input.req?.headers['user-agent'] ?? null;

        await AuditLogModel.create({
            category: input.category,
            action: input.action,
            summary: input.summary,
            actorId: input.actorId ?? requestActor.actorId ?? null,
            actorEmail: input.actorEmail ?? requestActor.actorEmail ?? null,
            actorName: input.actorName ?? requestActor.actorName ?? null,
            actorRole: input.actorRole ?? requestActor.actorRole ?? 'anonymous',
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            details: sanitizeDetails(input.details),
            ipAddress,
            userAgent,
            status: input.status ?? 'success',
        });
    } catch (error) {
        console.error('Failed to record audit log:', error);
    }
}

module.exports = {
    recordAuditLog,
    getActorFromRequest,
};
