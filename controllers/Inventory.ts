import type { Request, Response } from 'express';

const InventoryModel = require('../models/Inventory');
const { createInventorySchema, updateInventorySchema } = require('../schemas/inventorySchema');

function toNumber(value: unknown): unknown {
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
}

function normalizeInventoryPayload(payload: Record<string, unknown>) {
    return {
        ...payload,
        stockQuantity: toNumber(payload.stockQuantity),
        reorderLevel: toNumber(payload.reorderLevel),
        unitCost: toNumber(payload.unitCost),
    };
}

exports.createInventoryItem = async (req: Request, res: Response) => {
    try {
        const parsedBody = createInventorySchema.safeParse(normalizeInventoryPayload(req.body));
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const normalizedSku = parsedBody.data.skuCode.toUpperCase();
        const existing = await InventoryModel.findOne({ skuCode: normalizedSku });
        if (existing) {
            return res.status(409).json({ message: 'SKU Code already exists' });
        }

        const inventory = new InventoryModel({
            ...parsedBody.data,
            skuCode: normalizedSku,
        });
        await inventory.save();

        return res.status(201).json({
            message: 'Inventory item created successfully',
            inventory,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create inventory item' });
    }
};

exports.getInventoryItems = async (_req: Request, res: Response) => {
    try {
        const inventories = await InventoryModel.find().sort({ category: 1, itemName: 1 });
        return res.status(200).json({
            message: 'Inventory items fetched successfully',
            inventories,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch inventory items' });
    }
};

exports.getInventoryItemById = async (req: Request, res: Response) => {
    try {
        const inventory = await InventoryModel.findById(req.params.id);
        if (!inventory) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        return res.status(200).json({
            message: 'Inventory item fetched successfully',
            inventory,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch inventory item' });
    }
};

exports.updateInventoryItem = async (req: Request, res: Response) => {
    try {
        const parsedBody = updateInventorySchema.safeParse(normalizeInventoryPayload(req.body));
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const payload = { ...parsedBody.data };
        if (payload.skuCode) {
            payload.skuCode = payload.skuCode.toUpperCase();
            const existing = await InventoryModel.findOne({
                skuCode: payload.skuCode,
                _id: { $ne: req.params.id },
            });
            if (existing) {
                return res.status(409).json({ message: 'SKU Code already exists' });
            }
        }

        const inventory = await InventoryModel.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!inventory) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        return res.status(200).json({
            message: 'Inventory item updated successfully',
            inventory,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update inventory item' });
    }
};

exports.deleteInventoryItem = async (req: Request, res: Response) => {
    try {
        const inventory = await InventoryModel.findByIdAndDelete(req.params.id);
        if (!inventory) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        return res.status(200).json({ message: 'Inventory item deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete inventory item' });
    }
};

export {};
