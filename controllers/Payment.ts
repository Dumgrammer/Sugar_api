import type { Request, Response } from 'express';

const path = require('path');
const PaymentModel = require('../models/Payment');
const InventoryModel = require('../models/Inventory');
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

const ADD_ON_ALIAS_GROUPS = [
    { name: 'Extra Pearls', aliases: ['Extra Pearls', 'Pearls', 'Tapioca Pearls'] },
    { name: 'Nata', aliases: ['Nata', 'Nata de Coco'] },
    { name: 'Cream Puffs', aliases: ['Cream Puffs'] },
    { name: 'Whipped Cream', aliases: ['Whipped Cream'] },
];

function normalizeName(value: string): string {
    return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAddOnAliases(addOnName: string): string[] {
    const normalized = normalizeName(addOnName);
    const match = ADD_ON_ALIAS_GROUPS.find((group) =>
        group.aliases.some((alias) => normalizeName(alias) === normalized)
            || normalizeName(group.name) === normalized
    );
    return match ? match.aliases : [addOnName];
}

async function decrementAddOnInventory(cart: Array<any>) {
    const addOnCounts = new Map<string, { aliases: string[]; quantity: number }>();

    for (const item of cart) {
        const itemQuantity = Number(item?.quantity ?? 0);
        if (!Number.isFinite(itemQuantity) || itemQuantity <= 0) continue;
        const addOns = Array.isArray(item?.addOns) ? item.addOns : [];
        for (const addOn of addOns) {
            if (!addOn?.name) continue;
            const aliases = resolveAddOnAliases(String(addOn.name));
            const key = normalizeName(aliases[0] ?? String(addOn.name));
            const existing = addOnCounts.get(key);
            if (existing) {
                existing.quantity += itemQuantity;
            } else {
                addOnCounts.set(key, { aliases, quantity: itemQuantity });
            }
        }
    }

    if (!addOnCounts.size) return;

    for (const { aliases, quantity } of addOnCounts.values()) {
        const aliasFilters = aliases.map((alias) => ({
            itemName: new RegExp(`^${escapeRegExp(alias)}$`, 'i'),
        }));

        await InventoryModel.updateOne(
            { $or: aliasFilters },
            { $inc: { stockQuantity: -quantity } }
        );
    }
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
        await decrementAddOnInventory(parsedBody.data.cart);
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
