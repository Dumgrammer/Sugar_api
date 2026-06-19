const express = require('express');
const { requirePrivilegedStaff } = require('../middleware/requireSuperAdmin');
const { getAuditLogs, getAuditStats, exportAuditLogs } = require('../controllers/AuditLog');

const auditRouter = express.Router();

auditRouter.get('/', requirePrivilegedStaff, getAuditLogs);
auditRouter.get('/stats', requirePrivilegedStaff, getAuditStats);
auditRouter.get('/export', requirePrivilegedStaff, exportAuditLogs);

module.exports = auditRouter;

export {};
