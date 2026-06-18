const express = require('express');
const { requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { getAuditLogs, getAuditStats, exportAuditLogs } = require('../controllers/AuditLog');

const auditRouter = express.Router();

auditRouter.get('/', requireAdminOrSuperAdmin, getAuditLogs);
auditRouter.get('/stats', requireAdminOrSuperAdmin, getAuditStats);
auditRouter.get('/export', requireAdminOrSuperAdmin, exportAuditLogs);

module.exports = auditRouter;

export {};
