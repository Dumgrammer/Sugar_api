import type { Request } from 'express';

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '..', 'uploads');

function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function sanitizeName(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'customer';
}

function nowParts() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return {
        dateFolder: `${year}-${month}-${day}`,
        timeStamp: `${hours}-${minutes}-${seconds}`,
    };
}

const imageFilter = (_req: Request, file: any, cb: (error: any, accept?: boolean) => void) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        cb(null, true);
        return;
    }
    cb(new Error('Only image files are allowed'));
};

const menuStorage = multer.diskStorage({
    destination: (_req: Request, _file: any, cb: (error: any, destination: string) => void) => {
        const menuDir = path.join(uploadRoot, 'menu');
        ensureDir(menuDir);
        cb(null, menuDir);
    },
    filename: (_req: Request, file: any, cb: (error: any, filename: string) => void) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
        const fileName = `menu-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, fileName);
    },
});

const paymentStorage = multer.diskStorage({
    destination: (_req: Request, _file: any, cb: (error: any, destination: string) => void) => {
        const { dateFolder } = nowParts();
        const paymentDir = path.join(uploadRoot, 'payments', dateFolder);
        ensureDir(paymentDir);
        cb(null, paymentDir);
    },
    filename: (req: Request, file: any, cb: (error: any, filename: string) => void) => {
        const { timeStamp } = nowParts();
        const customerName = sanitizeName(String(req.body?.customerName ?? 'customer'));
        const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
        const fileName = `${timeStamp}_${customerName}_${Math.round(Math.random() * 1e6)}${ext}`;
        cb(null, fileName);
    },
});

const menuUpload = multer({
    storage: menuStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});

const paymentUpload = multer({
    storage: paymentStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = {
    uploadMenuImage: menuUpload.single('image'),
    uploadPaymentImage: paymentUpload.single('paymentImage'),
};

export {};
