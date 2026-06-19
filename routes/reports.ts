const express = require('express');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { exportReport } = require('../controllers/Reports');

const reportsRouter = express.Router();

reportsRouter.get('/export', requireSuperAdmin, exportReport);

module.exports = reportsRouter;

export {};
