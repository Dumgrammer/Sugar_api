const express = require('express');
const { createAdmin, loginAdmin, getAdmins } = require('../controllers/Admin');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const adminRouter = express.Router();

adminRouter.post('/', requireSuperAdmin, createAdmin);
adminRouter.post('/login', loginAdmin);
adminRouter.get('/', requireSuperAdmin, getAdmins);

module.exports = adminRouter;

export {};
