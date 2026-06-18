const mongoose = require('mongoose');

const AUDIT_CATEGORIES = ['auth', 'transaction', 'inventory', 'menu', 'order', 'user', 'system', 'report'] as const;
const AUDIT_STATUSES = ['success', 'failure'] as const;
const AUDIT_ACTOR_ROLES = ['admin', 'super_admin', 'customer', 'system', 'anonymous'] as const;

const auditLogSchema = new mongoose.Schema(
    {
        category: {
            type: String,
            enum: AUDIT_CATEGORIES,
            required: true,
            index: true,
        },
        action: {
            type: String,
            required: true,
            index: true,
        },
        summary: {
            type: String,
            required: true,
        },
        actorId: {
            type: String,
            default: null,
        },
        actorEmail: {
            type: String,
            default: null,
        },
        actorName: {
            type: String,
            default: null,
        },
        actorRole: {
            type: String,
            enum: AUDIT_ACTOR_ROLES,
            default: 'anonymous',
            index: true,
        },
        entityType: {
            type: String,
            default: null,
        },
        entityId: {
            type: String,
            default: null,
            index: true,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        ipAddress: {
            type: String,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: AUDIT_STATUSES,
            default: 'success',
            index: true,
        },
    },
    { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;

export {};
