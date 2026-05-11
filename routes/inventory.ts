const express = require('express');
const {
    createInventoryItem,
    getInventoryItems,
    getInventoryItemById,
    updateInventoryItem,
    deleteInventoryItem,
    exportInventoryItems,
    getPublicAddOnInventory
} = require('../controllers/Inventory');
const { requireSuperAdmin, requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');

const inventoryRouter = express.Router();

inventoryRouter.get('/', requireAdminOrSuperAdmin, getInventoryItems);
inventoryRouter.get('/export', requireAdminOrSuperAdmin, exportInventoryItems);
inventoryRouter.get('/:id', requireAdminOrSuperAdmin, getInventoryItemById);
inventoryRouter.post('/', requireAdminOrSuperAdmin, createInventoryItem);
inventoryRouter.get('/public/add-ons', getPublicAddOnInventory);
inventoryRouter.patch('/:id', requireAdminOrSuperAdmin, updateInventoryItem);
inventoryRouter.delete('/:id', requireSuperAdmin, deleteInventoryItem);

module.exports = inventoryRouter;

export {};
