import type { Request, Response } from 'express';

const PaymentModel = require('../models/Payment');
const { updatePaymentStatusSchema } = require('../schemas/paymentSchema');

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

        return res.status(200).json({
            message: 'Order payment confirmed successfully',
            order,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to confirm order payment' });
    }
};

export {};
