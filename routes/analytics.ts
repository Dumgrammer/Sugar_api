const express = require('express');
const { requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { getDashboardAnalytics, getSalesAnalytics, exportAnalytics } = require('../controllers/Analytics');

const analyticsRouter = express.Router();

analyticsRouter.get('/dashboard', requireAdminOrSuperAdmin, getDashboardAnalytics);
analyticsRouter.get('/sales', requireAdminOrSuperAdmin, getSalesAnalytics);
analyticsRouter.get('/export', requireAdminOrSuperAdmin, exportAnalytics);

module.exports = analyticsRouter;

export {};
