const express = require('express');
const { requireSuperAdmin, requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { getDashboardAnalytics, getSalesAnalytics, exportAnalytics } = require('../controllers/Analytics');

const analyticsRouter = express.Router();

analyticsRouter.get('/dashboard', requireAdminOrSuperAdmin, getDashboardAnalytics);
analyticsRouter.get('/sales', requireSuperAdmin, getSalesAnalytics);
analyticsRouter.get('/export', requireSuperAdmin, exportAnalytics);

module.exports = analyticsRouter;

export {};
