const express = require('express');
const { requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { getOrders, updateOrderStatus, confirmOrderPayment } = require('../controllers/Order');

const orderRouter = express.Router();

orderRouter.get('/', requireAdminOrSuperAdmin, getOrders);
orderRouter.patch('/:id/status', requireAdminOrSuperAdmin, updateOrderStatus);
orderRouter.patch('/:id/confirm', requireAdminOrSuperAdmin, confirmOrderPayment);

module.exports = orderRouter;

export {};
