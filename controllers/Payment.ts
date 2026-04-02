import type { Request, Response } from 'express';

const path = require('path');
const PaymentModel = require('../models/Payment');
const { createPaymentSchema, updatePaymentStatusSchema } = require('../schemas/paymentSchema');

function toPublicUploadPath(filePath: string): string {
    const appRoot = path.join(__dirname, '..');
    const relativePath = path.relative(appRoot, filePath).replace(/\\/g, '/');
    return `/${relativePath}`;
}

function toNumber(value: unknown): unknown {
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
}

function normalizeCart(cart: unknown): unknown {
    if (typeof cart === 'string' && cart.trim() !== '') {
        try {
            const parsed = JSON.parse(cart);
            return parsed;
        } catch (error) {
            return cart;
        }
    }
    return cart;
}

function normalizePaymentPayload(req: Request): any {
    const body = { ...req.body };
    body.amount = toNumber(body.amount);
    body.cart = normalizeCart(body.cart);
    if (!body.cart) body.cart = [];
    return body;
}

exports.createPayment = async (req: Request, res: Response) => {
    try {
        const requestWithFile = req as Request & { file?: { path?: string } };
        const parsedBody = createPaymentSchema.safeParse(normalizePaymentPayload(req));
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }
        const requiresProofImage = parsedBody.data.paymentMethod !== 'Cash';
        if (requiresProofImage && !requestWithFile.file?.path) {
            return res.status(400).json({ message: 'Payment proof image is required' });
        }

        const payment = new PaymentModel({
            ...parsedBody.data,
            proofImage: requestWithFile.file?.path ? toPublicUploadPath(requestWithFile.file.path) : '',
            status: 'received',
            paymentConfirmed: parsedBody.data.paymentMethod === 'Cash',
        });

        await payment.save();
        return res.status(201).json({
            message: 'Payment created successfully',
            payment,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create payment' });
    }
};

exports.getPayments = async (_req: Request, res: Response) => {
    try {
        const payments = await PaymentModel.find().sort({ createdAt: -1 });
        return res.status(200).json({
            message: 'Payments fetched successfully',
            payments,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch payments' });
    }
};

exports.getPaymentForTracking = async (req: Request, res: Response) => {
    try {
        const payment = await PaymentModel.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        return res.status(200).json({
            message: 'Payment fetched successfully',
            payment,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch payment' });
    }
};

exports.updatePaymentStatus = async (req: Request, res: Response) => {
    try {
        const parsedBody = updatePaymentStatusSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const payment = await PaymentModel.findByIdAndUpdate(
            req.params.id,
            { status: parsedBody.data.status },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        return res.status(200).json({
            message: 'Payment status updated successfully',
            payment,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update payment status' });
    }
};

exports.confirmPayment = async (req: Request, res: Response) => {
    try {
        const payment = await PaymentModel.findByIdAndUpdate(
            req.params.id,
            { paymentConfirmed: true },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        return res.status(200).json({
            message: 'Payment confirmed successfully',
            payment,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to confirm payment' });
    }
};

export {};
