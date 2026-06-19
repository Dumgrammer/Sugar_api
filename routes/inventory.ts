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
const { requireSuperAdmin, requirePrivilegedStaff } = require('../middleware/requireSuperAdmin');

const inventoryRouter = express.Router();

inventoryRouter.get('/', requirePrivilegedStaff, getInventoryItems);
inventoryRouter.get('/export', requirePrivilegedStaff, exportInventoryItems);
inventoryRouter.get('/public/add-ons', getPublicAddOnInventory);
inventoryRouter.get('/:id', requirePrivilegedStaff, getInventoryItemById);
inventoryRouter.post('/', requirePrivilegedStaff, createInventoryItem);
inventoryRouter.patch('/:id', requirePrivilegedStaff, updateInventoryItem);
inventoryRouter.delete('/:id', requireSuperAdmin, deleteInventoryItem);

module.exports = inventoryRouter;

export {};
