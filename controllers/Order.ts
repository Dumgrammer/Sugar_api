import type { Request, Response } from 'express';

const PaymentModel = require('../models/Payment');
const { updatePaymentStatusSchema } = require('../schemas/paymentSchema');
const { recordAuditLog } = require('../services/audit-log');

exports.getOrders = async (_req: Request, res: Response) => {
    try {
        const orders = await PaymentModel.find().sort({ createdAt: -1 });
        return res.status(200).json({
            message: 'Orders fetched successfully',
            orders,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch orders' });
    }
};

exports.deleteAllOrders = async (req: Request, res: Response) => {
    try {
        const count = await PaymentModel.countDocuments({});
        await PaymentModel.deleteMany({});

        await recordAuditLog({
            req,
            category: 'system',
            action: 'orders_purged',
            summary: `Purged all orders (${count} records deleted)`,
            details: { deletedCount: count },
        });

        return res.status(200).json({ message: 'All orders deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete orders' });
    }
};

exports.updateOrderStatus = async (req: Request, res: Response) => {
    try {
        const parsedBody = updatePaymentStatusSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const order = await PaymentModel.findByIdAndUpdate(
            req.params.id,
            { status: parsedBody.data.status },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        await recordAuditLog({
            req,
            category: 'order',
            action: 'status_updated',
            summary: `Order ${order.orderNumber || order._id} status → ${parsedBody.data.status}`,
            entityType: 'Payment',
            entityId: order._id.toString(),
            details: { status: parsedBody.data.status, orderNumber: order.orderNumber },
        });

        return res.status(200).json({
            message: 'Order status updated successfully',
            order,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update order status' });
    }
};

exports.confirmOrderPayment = async (req: Request, res: Response) => {
    try {
        const order = await PaymentModel.findByIdAndUpdate(
            req.params.id,
            { paymentConfirmed: true },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        await recordAuditLog({
            req,
            category: 'order',
            action: 'payment_confirmed',
            summary: `Order payment confirmed: ${order.orderNumber || order._id}`,
            entityType: 'Payment',
            entityId: order._id.toString(),
            details: { orderNumber: order.orderNumber, amount: order.amount },
        });

        return res.status(200).json({
            message: 'Order payment confirmed successfully',
            order,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to confirm order payment' });
    }
};

export {};
