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

inventoryRouter.get('/', requireSuperAdmin, getInventoryItems);
inventoryRouter.get('/export', requireSuperAdmin, exportInventoryItems);
inventoryRouter.get('/public/add-ons', getPublicAddOnInventory);
inventoryRouter.get('/:id', requireSuperAdmin, getInventoryItemById);
inventoryRouter.post('/', requireSuperAdmin, createInventoryItem);
inventoryRouter.patch('/:id', requireSuperAdmin, updateInventoryItem);
inventoryRouter.delete('/:id', requireSuperAdmin, deleteInventoryItem);

module.exports = inventoryRouter;

export {};
