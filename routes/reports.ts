const express = require('express');
const { requirePrivilegedStaff } = require('../middleware/requireSuperAdmin');
const { exportReport } = require('../controllers/Reports');

const reportsRouter = express.Router();

reportsRouter.get('/export', requirePrivilegedStaff, exportReport);

module.exports = reportsRouter;

export {};
