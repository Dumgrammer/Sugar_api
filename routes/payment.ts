const express = require('express');
const {
    createPayment,
    getPayments,
    getPaymentForTracking,
    updatePaymentStatus,
    confirmPayment,
} = require('../controllers/Payment');
const { requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { uploadPaymentImage } = require('../middleware/upload');

const paymentRouter = express.Router();

paymentRouter.post('/', uploadPaymentImage, createPayment);
paymentRouter.get('/track/:id', getPaymentForTracking);
paymentRouter.get('/', requireAdminOrSuperAdmin, getPayments);
paymentRouter.patch('/:id/status', requireAdminOrSuperAdmin, updatePaymentStatus);
paymentRouter.patch('/:id/confirm', requireAdminOrSuperAdmin, confirmPayment);

module.exports = paymentRouter;

export {};
