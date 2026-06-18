const express = require('express');
const { requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { exportReport } = require('../controllers/Reports');

const reportsRouter = express.Router();

reportsRouter.get('/export', requireAdminOrSuperAdmin, exportReport);

module.exports = reportsRouter;

export {};
