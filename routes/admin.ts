const express = require('express');
const { createAdmin, loginAdmin } = require('../controllers/Admin');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const adminRouter = express.Router();

adminRouter.post('/', requireSuperAdmin, createAdmin);
adminRouter.post('/login', loginAdmin);

module.exports = adminRouter;

export {};
