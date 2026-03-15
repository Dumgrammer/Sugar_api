import type { Request, Response } from 'express';

const MenuModel = require('../models/Menu');
const {
    createMenuSchema,
    updateMenuSchema,
    updateMenuStockSchema,
} = require('../schemas/menuSchema');

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

exports.createMenu = async (req: Request, res: Response) => {
    try {
        const parsedBody = createMenuSchema.safeParse(req.body);
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
        const menus = await MenuModel.find().sort({ createdAt: -1 });
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
        const menu = await MenuModel.findById(req.params.id);
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
        const parsedBody = updateMenuSchema.safeParse(req.body);
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

        const menu = await MenuModel.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!menu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

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

exports.updateMenuStock = async (req: Request, res: Response) => {
    try {
        const parsedBody = updateMenuStockSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsedBody.error.flatten().fieldErrors,
            });
        }

        const { quantity } = parsedBody.data;
        const menu = await MenuModel.findByIdAndUpdate(
            req.params.id,
            { $inc: { stock: quantity } },
            { new: true }
        );
        if (!menu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

        return res.status(200).json({
            message: 'Stock updated successfully',
            menu,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update stock' });
    }
};

exports.deleteMenu = async (req: Request, res: Response) => {
    try {
        const menu = await MenuModel.findByIdAndDelete(req.params.id);
        if (!menu) {
            return res.status(404).json({ message: 'Menu item not found' });
        }

        return res.status(200).json({ message: 'Menu item deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete menu item' });
    }
};
