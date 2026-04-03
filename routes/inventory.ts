const express = require('express');
const {
    createInventoryItem,
    getInventoryItems,
    getInventoryItemById,
    updateInventoryItem,
    deleteInventoryItem,
} = require('../controllers/Inventory');
const { requireSuperAdmin, requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');

const inventoryRouter = express.Router();

inventoryRouter.get('/', requireAdminOrSuperAdmin, getInventoryItems);
inventoryRouter.get('/:id', requireAdminOrSuperAdmin, getInventoryItemById);
inventoryRouter.post('/', requireAdminOrSuperAdmin, createInventoryItem);
inventoryRouter.patch('/:id', requireAdminOrSuperAdmin, updateInventoryItem);
inventoryRouter.delete('/:id', requireSuperAdmin, deleteInventoryItem);

module.exports = inventoryRouter;

export {};
