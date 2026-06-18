import type { Request, Response } from 'express';

const MenuModel = require('../models/Menu');
const path = require('path');
const {
    createMenuSchema,
    updateMenuSchema,
} = require('../schemas/menuSchema');
const { recordAuditLog } = require('../services/audit-log');

function getCurrentTimeString(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function isWithinAvailabilityPeriod(startTime: string, endTime: string, currentTime: string): boolean {
    if (startTime <= endTime) {
        return currentTime >= startTime && currentTime <= endTime;
    }
    return currentTime >= startTime || currentTime <= endTime;
}

function getMenuAvailabilityNow(menu: any): boolean {
    if (!menu.available) return false;
    if (!menu.availabilityTime || menu.availabilityTime.mode === 'anytime') return true;

    const { startTime, endTime } = menu.availabilityTime;
    if (!startTime || !endTime) return false;

    return isWithinAvailabilityPeriod(startTime, endTime, getCurrentTimeString());
}

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

function toBoolean(value: unknown): unknown {
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }
    return value;
}

function normalizeAvailabilityTime(body: any): any {
    if (body.availabilityTime && typeof body.availabilityTime === 'string') {
        try {
            body.availabilityTime = JSON.parse(body.availabilityTime);
        } catch (error) {
            // Keep original string so validation can fail with clear message.
        }
    }

    // Supports multipart form fields from frontend.
    if (!body.availabilityTime && body.availabilityMode) {
        body.availabilityTime =
            body.availabilityMode === 'period'
                ? {
                    mode: 'period',
                    startTime: body.startTime,
                    endTime: body.endTime,
                }
                : { mode: 'anytime' };
    }

    return body;
}

function normalizeMenuPayload(req: Request): any {
    const requestWithFile = req as Request & { file?: { path?: string } };
    const body = normalizeAvailabilityTime({ ...req.body });
    body.price = toNumber(body.price);
    body.available = toBoolean(body.available);

    if (typeof body.recipe === 'string' && body.recipe.trim() !== '') {
        try {
            body.recipe = JSON.parse(body.recipe);
        } catch (error) {
            // Keep original string so validation can fail with clear message.
        }
    }

    if (requestWithFile.file?.path) {
        body.image = toPublicUploadPath(requestWithFile.file.path);
    }

    return body;
}

exports.createMenu = async (req: Request, res: Response) => {
    try {
        const parsedBody = createMenuSchema.safeParse(normalizeMenuPayload(req));
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const payload = parsedBody.data;
        const menu = new MenuModel({
            ...payload,
            availabilityTime:
                payload.availabilityTime.mode === 'anytime'
                    ? { mode: 'anytime', startTime: null, endTime: null }
                    : payload.availabilityTime,
        });

        await menu.save();

        await recordAuditLog({
            req,
            category: 'menu',
            action: 'item_created',
            summary: `Created menu item "${menu.name}"`,
            entityType: 'Menu',
            entityId: menu._id.toString(),
            details: { name: menu.name, category: menu.category, price: menu.price },
        });

        return res.status(201).json({
            message: 'Menu item created successfully',
            menu,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create menu item' });
    }
};

exports.getMenus = async (_req: Request, res: Response) => {
    try {
        const menus = await MenuModel.find()
            .populate('recipe.inventory', 'skuCode itemName category unit')
            .sort({ createdAt: -1 });
        const data = menus.map((menu: any) => ({
            ...menu.toObject(),
            isAvailableNow: getMenuAvailabilityNow(menu),
        }));

        return res.status(200).json({
            message: 'Menu items fetched successfully',
            menus: data,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch menu items' });
    }
};

exports.getMenuById = async (req: Request, res: Response) => {
    try {
        const menu = await MenuModel.findById(req.params.id)
            .populate('recipe.inventory', 'skuCode itemName category unit');
        if (!menu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

        return res.status(200).json({
            message: 'Menu item fetched successfully',
            menu: {
                ...menu.toObject(),
                isAvailableNow: getMenuAvailabilityNow(menu),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch menu item' });
    }
};

exports.updateMenu = async (req: Request, res: Response) => {
    try {
        const parsedBody = updateMenuSchema.safeParse(normalizeMenuPayload(req));
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const payload = parsedBody.data;
        if (payload.availabilityTime?.mode === 'anytime') {
            payload.availabilityTime = { mode: 'anytime', startTime: null, endTime: null };
        }

        const existingMenu = await MenuModel.findById(req.params.id);
        if (!existingMenu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

        const menu = await MenuModel.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!menu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

        await recordAuditLog({
            req,
            category: 'menu',
            action: 'item_updated',
            summary: `Updated menu item "${menu.name}"`,
            entityType: 'Menu',
            entityId: menu._id.toString(),
            details: { name: menu.name, previousName: existingMenu.name, changes: payload },
        });

        return res.status(200).json({
            message: 'Menu item updated successfully',
            menu: {
                ...menu.toObject(),
                isAvailableNow: getMenuAvailabilityNow(menu),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update menu item' });
    }
};

exports.deleteMenu = async (req: Request, res: Response) => {
    try {
        const menu = await MenuModel.findByIdAndDelete(req.params.id);
        if (!menu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

        await recordAuditLog({
            req,
            category: 'menu',
            action: 'item_deleted',
            summary: `Deleted menu item "${menu.name}"`,
            entityType: 'Menu',
            entityId: menu._id.toString(),
            details: { name: menu.name, category: menu.category },
        });

        return res.status(200).json({ message: 'Menu item deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete menu item' });
    }
};
