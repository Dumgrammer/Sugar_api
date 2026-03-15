const express = require('express');
const {
    createMenu,
    getMenus,
    getMenuById,
    updateMenu,
    updateMenuStock,
    deleteMenu,
} = require('../controllers/Menu');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const menuRouter = express.Router();

menuRouter.get('/', getMenus);
menuRouter.get('/:id', getMenuById);
menuRouter.post('/', requireSuperAdmin, createMenu);
menuRouter.patch('/:id', requireSuperAdmin, updateMenu);
menuRouter.patch('/:id/stock', requireSuperAdmin, updateMenuStock);
menuRouter.delete('/:id', requireSuperAdmin, deleteMenu);

module.exports = menuRouter;

export {};
