import type { Request, Response } from 'express';

const InventoryModel = require('../models/Inventory');
const { createInventorySchema, updateInventorySchema } = require('../schemas/inventorySchema');
const { recordAuditLog } = require('../services/audit-log');

const PUBLIC_ADD_ONS = [
    { name: 'Extra Pearls', aliases: ['Extra Pearls', 'Pearls', 'Tapioca Pearls'] },
    { name: 'Nata', aliases: ['Nata', 'Nata de Coco'] },
    { name: 'Cream Puffs', aliases: ['Cream Puffs'] },
    { name: 'Whipped Cream', aliases: ['Whipped Cream'] },
];


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

        await recordAuditLog({
            req,
            category: 'inventory',
            action: 'item_created',
            summary: `Created inventory item ${inventory.itemName} (${inventory.skuCode})`,
            entityType: 'Inventory',
            entityId: inventory._id.toString(),
            details: {
                skuCode: inventory.skuCode,
                itemName: inventory.itemName,
                stockQuantity: inventory.stockQuantity,
            },
        });

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

exports.getPublicAddOnInventory = async (_req: Request, res: Response) => {
    try {
        const inventories = await InventoryModel.find({
            $or: PUBLIC_ADD_ONS.flatMap((addOn) =>
                addOn.aliases.map((alias) => ({
                    itemName: new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                }))
            ),
        })
            .select('itemName stockQuantity updatedAt')
            .sort({ itemName: 1 });

        const inventoryByName = new Map<string, any>(
            inventories.map((item: any) => [String(item.itemName ?? '').trim().toLowerCase(), item])
        );

        const addOns = PUBLIC_ADD_ONS.map((addOn) => {
            const matchedInventory = addOn.aliases
                .map((alias) => inventoryByName.get(alias.trim().toLowerCase()))
                .find(Boolean);

            return {
                itemName: addOn.name,
                stockQuantity: matchedInventory?.stockQuantity ?? 0,
                updatedAt: matchedInventory?.updatedAt,
            };
        });

        return res.status(200).json({
            message: 'Add-on inventory fetched successfully',
            addOns,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch add-on inventory' });
    }
};

exports.exportInventoryItems = async (req: Request, res: Response) => {
    try {
        const { formatReportDateTime, formatReportDate } = require('../services/reportDateTime');
        const { recordAuditLog } = require('../services/audit-log');
        const inventories = await InventoryModel.find().sort({ category: 1, itemName: 1 });

        const escapeCsv = (value: string): string => {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };

        const now = new Date();
        const rows: string[] = [];
        rows.push('SUGAR CAFE INVENTORY EXPORT');
        rows.push(`Generated At,${formatReportDateTime(now)}`);
        rows.push('');
        rows.push('SKU Code,Item Name,Category,Unit,Stock Quantity,Reorder Level,Unit Cost,Stock Value,Status');

        inventories.forEach((item: any) => {
            const skuCode = String(item.skuCode ?? '');
            const itemName = String(item.itemName ?? '');
            const category = String(item.category ?? '');
            const unit = String(item.unit ?? '');
            const stockQuantity = toNumber(item.stockQuantity);
            const reorderLevel = toNumber(item.reorderLevel);
            const unitCost = toNumber(item.unitCost);

            const safeStock = typeof stockQuantity === 'number' ? stockQuantity : 0;
            const safeReorder = typeof reorderLevel === 'number' ? reorderLevel : 0;
            const safeCost = typeof unitCost === 'number' ? unitCost : 0;
            const stockValue = safeStock * safeCost;
            const status = safeStock === 0 ? 'Out of Stock' : safeStock <= safeReorder ? 'Low Stock' : 'Healthy';

            rows.push([
                escapeCsv(skuCode),
                escapeCsv(itemName),
                escapeCsv(category),
                escapeCsv(unit),
                String(safeStock),
                String(safeReorder),
                safeCost.toFixed(2),
                stockValue.toFixed(2),
                escapeCsv(status),
            ].join(','));
        });

        const csv = `\uFEFF${rows.join('\n')}`;
        const filename = `inventory_${formatReportDate(now)}.csv`;

        await recordAuditLog({
            req,
            category: 'report',
            action: 'inventory_export',
            summary: `Exported inventory CSV (${inventories.length} items)`,
            details: { itemCount: inventories.length, format: 'csv' },
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csv);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to export inventory items' });
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

exports.getPublicAddOnInventory = async (_req: Request, res: Response) => {
    try {
        const inventories = await InventoryModel.find({
            $or: PUBLIC_ADD_ONS.flatMap((addOn) =>
                addOn.aliases.map((alias) => ({
                    itemName: new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                }))
            ),
        })
            .select('itemName stockQuantity updatedAt')
            .sort({ itemName: 1 });

        const inventoryByName = new Map<string, any>(
            inventories.map((item: any) => [String(item.itemName ?? '').trim().toLowerCase(), item])
        );

        const addOns = PUBLIC_ADD_ONS.map((addOn) => {
            const matchedInventory = addOn.aliases
                .map((alias) => inventoryByName.get(alias.trim().toLowerCase()))
                .find(Boolean);

            return {
                itemName: addOn.name,
                stockQuantity: matchedInventory?.stockQuantity ?? 0,
                updatedAt: matchedInventory?.updatedAt,
            };
        });

        return res.status(200).json({
            message: 'Add-on inventory fetched successfully',
            addOns,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch add-on inventory' });
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

        const existingItem = await InventoryModel.findById(req.params.id);
        if (!existingItem) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        const inventory = await InventoryModel.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!inventory) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        const stockChanged = payload.stockQuantity !== undefined
            && Number(payload.stockQuantity) !== Number(existingItem.stockQuantity);

        await recordAuditLog({
            req,
            category: 'inventory',
            action: stockChanged ? 'stock_updated' : 'item_updated',
            summary: stockChanged
                ? `Updated stock for ${inventory.itemName}: ${existingItem.stockQuantity} → ${inventory.stockQuantity}`
                : `Updated inventory item ${inventory.itemName} (${inventory.skuCode})`,
            entityType: 'Inventory',
            entityId: inventory._id.toString(),
            details: {
                skuCode: inventory.skuCode,
                previousStock: existingItem.stockQuantity,
                newStock: inventory.stockQuantity,
                changes: payload,
            },
        });

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

        await recordAuditLog({
            req,
            category: 'inventory',
            action: 'item_deleted',
            summary: `Deleted inventory item ${inventory.itemName} (${inventory.skuCode})`,
            entityType: 'Inventory',
            entityId: inventory._id.toString(),
            details: { skuCode: inventory.skuCode, itemName: inventory.itemName },
        });

        return res.status(200).json({ message: 'Inventory item deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete inventory item' });
    }
};

export {};
