const express = require('express');
const {
    createMenu,
    getMenus,
    getMenuById,
    updateMenu,
    deleteMenu,
} = require('../controllers/Menu');
const { requireSuperAdmin, requireAdminOrSuperAdmin } = require('../middleware/requireSuperAdmin');
const { uploadMenuImage } = require('../middleware/upload');

const menuRouter = express.Router();

menuRouter.get('/', getMenus);
menuRouter.get('/:id', getMenuById);
menuRouter.post('/', requireAdminOrSuperAdmin, uploadMenuImage, createMenu);
menuRouter.patch('/:id', requireAdminOrSuperAdmin, uploadMenuImage, updateMenu);
menuRouter.delete('/:id', requireSuperAdmin, deleteMenu);

module.exports = menuRouter;

export {};
