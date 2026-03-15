const express = require('express');
const { createSuperAdmin, loginSuperAdmin } = require('../controllers/SuperAdmin');

const superAdminRouter = express.Router();

superAdminRouter.post('/', createSuperAdmin);
superAdminRouter.post('/login', loginSuperAdmin);

module.exports = superAdminRouter;

export {};
