import type { Request, Response } from 'express';

const AuditLogModel = require('../models/AuditLog');
const { formatReportDateTime, formatReportDate, parseManilaDateBoundary } = require('../services/reportDateTime');

const VALID_CATEGORIES = new Set(['auth', 'transaction', 'inventory', 'menu', 'order', 'user', 'system', 'report']);

function escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(Math.floor(parsed), max);
}

function buildDateFilter(req: Request): Record<string, Date> | null {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';

    if (!from && !to) return null;

    const filter: Record<string, Date> = {};
    if (from) {
        const start = parseManilaDateBoundary(from, false);
        if (!start) return null;
        filter.$gte = start;
    }
    if (to) {
        const end = parseManilaDateBoundary(to, true);
        if (!end) return null;
        filter.$lte = end;
    }
    return filter;
}

function buildListFilter(req: Request): { filter: Record<string, unknown>; error?: string } {
    const filter: Record<string, unknown> = {};
    const dateFilter = buildDateFilter(req);
    if (dateFilter === null && (req.query.from || req.query.to)) {
        return { filter, error: 'Invalid date range. Use YYYY-MM-DD format.' };
    }
    if (dateFilter) {
        filter.createdAt = dateFilter;
    }

    const category = typeof req.query.category === 'string' ? req.query.category : '';
    if (category && category !== 'all') {
        if (!VALID_CATEGORIES.has(category)) {
            return { filter, error: 'Invalid category filter.' };
        }
        filter.category = category;
    }

    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    if (action) {
        filter.action = action;
    }

    const actorRole = typeof req.query.actorRole === 'string' ? req.query.actorRole : '';
    if (actorRole && actorRole !== 'all') {
        filter.actorRole = actorRole;
    }

    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status === 'success' || status === 'failure') {
        filter.status = status;
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
        filter.$or = [
            { summary: { $regex: search, $options: 'i' } },
            { actorEmail: { $regex: search, $options: 'i' } },
            { actorName: { $regex: search, $options: 'i' } },
            { entityId: { $regex: search, $options: 'i' } },
        ];
    }

    return { filter };
}

exports.getAuditLogs = async (req: Request, res: Response) => {
    try {
        const page = parsePositiveInt(req.query.page, 1, 10_000);
        const limit = parsePositiveInt(req.query.limit, 25, 100);
        const skip = (page - 1) * limit;

        const { filter, error } = buildListFilter(req);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const [logs, total] = await Promise.all([
            AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            AuditLogModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            message: 'Audit logs fetched successfully',
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch audit logs' });
    }
};

exports.getAuditStats = async (_req: Request, res: Response) => {
    try {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [categoryCounts, recentFailures, totalToday] = await Promise.all([
            AuditLogModel.aggregate([
                { $match: { createdAt: { $gte: dayAgo } } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
            ]),
            AuditLogModel.countDocuments({ createdAt: { $gte: dayAgo }, status: 'failure' }),
            AuditLogModel.countDocuments({ createdAt: { $gte: dayAgo } }),
        ]);

        const byCategory: Record<string, number> = {};
        for (const row of categoryCounts) {
            byCategory[row._id] = row.count;
        }

        return res.status(200).json({
            message: 'Audit stats fetched successfully',
            stats: {
                last24Hours: {
                    total: totalToday,
                    failures: recentFailures,
                    byCategory,
                },
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch audit stats' });
    }
};

exports.exportAuditLogs = async (req: Request, res: Response) => {
    try {
        const { filter, error } = buildListFilter(req);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const logs = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
        const now = new Date();
        const rows: string[] = [];

        const { recordAuditLog } = require('../services/audit-log');
        await recordAuditLog({
            req,
            category: 'report',
            action: 'audit_exported',
            summary: `Exported audit trail CSV (${logs.length} entries)`,
            details: { entryCount: logs.length },
        });

        rows.push('SUGAR CAFE AUDIT TRAIL EXPORT');
        rows.push(`Generated At,${formatReportDateTime(now)}`);
        rows.push('');
        rows.push('Timestamp,Category,Action,Status,Actor,Role,Entity Type,Entity ID,Summary,IP Address');

        for (const log of logs) {
            const actor = log.actorName || log.actorEmail || '—';
            rows.push([
                escapeCsv(formatReportDateTime(new Date(log.createdAt))),
                escapeCsv(String(log.category ?? '')),
                escapeCsv(String(log.action ?? '')),
                escapeCsv(String(log.status ?? '')),
                escapeCsv(String(actor)),
                escapeCsv(String(log.actorRole ?? '')),
                escapeCsv(String(log.entityType ?? '')),
                escapeCsv(String(log.entityId ?? '')),
                escapeCsv(String(log.summary ?? '')),
                escapeCsv(String(log.ipAddress ?? '')),
            ].join(','));
        }

        const csv = `\uFEFF${rows.join('\n')}`;
        const filename = `audit_trail_${formatReportDate(now)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csv);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to export audit logs' });
    }
};

export {};
