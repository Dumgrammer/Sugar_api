const express = require('express');
const { requireSuperAdmin, requireAdminOrSuperAdmin, requirePrivilegedStaff } = require('../middleware/requireSuperAdmin');
const { getDashboardAnalytics, getSalesAnalytics, exportAnalytics } = require('../controllers/Analytics');

const analyticsRouter = express.Router();

analyticsRouter.get('/dashboard', requireAdminOrSuperAdmin, getDashboardAnalytics);
analyticsRouter.get('/sales', requirePrivilegedStaff, getSalesAnalytics);
analyticsRouter.get('/export', requirePrivilegedStaff, exportAnalytics);

module.exports = analyticsRouter;

export {};
