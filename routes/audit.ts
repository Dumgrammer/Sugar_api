const express = require('express');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { getAuditLogs, getAuditStats, exportAuditLogs } = require('../controllers/AuditLog');

const auditRouter = express.Router();

auditRouter.get('/', requireSuperAdmin, getAuditLogs);
auditRouter.get('/stats', requireSuperAdmin, getAuditStats);
auditRouter.get('/export', requireSuperAdmin, exportAuditLogs);

module.exports = auditRouter;

export {};
