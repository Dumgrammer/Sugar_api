const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const MenuModel = require('../models/Menu');

dotenv.config();

type FolderConfig = {
    folder: string;
    category: 'desserts' | 'coffee' | 'milk-tea';
    price: number;
    descriptionPrefix: string;
};

const folderConfigs: FolderConfig[] = [
    {
        folder: 'CHEESECAKE',
        category: 'desserts',
        price: 169,
        descriptionPrefix: 'Creamy cheesecake',
    },
    {
        folder: 'FRAPPES',
        category: 'coffee',
        price: 159,
        descriptionPrefix: 'Refreshing frappe',
    },
    {
        folder: 'MILKTEA',
        category: 'milk-tea',
        price: 129,
        descriptionPrefix: 'Creamy milk tea',
    },
];

function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function toTitleCase(rawName: string): string {
    return rawName
        .replace(/[_-]+/g, ' ')
        .replace(/\s*&\s*/g, ' & ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((part: string) => {
            if (part === '&') return '&';
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(' ');
}

function toSlug(rawName: string): string {
    return rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildDescription(prefix: string, menuName: string): string {
    return `${prefix} flavored as ${menuName}.`;
}

function isImageFile(fileName: string): boolean {
    return /\.(jpg|jpeg|png|webp)$/i.test(fileName);
}

async function seedMenus(): Promise<void> {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI is not configured in .env');
    }

    const seedRoot = __dirname;
    const uploadsMenuDir = path.join(__dirname, '..', 'uploads', 'menu');
    ensureDir(uploadsMenuDir);

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    let processed = 0;
    let inserted = 0;
    let updated = 0;

    for (const config of folderConfigs) {
        const sourceDir = path.join(seedRoot, config.folder);
        if (!fs.existsSync(sourceDir)) {
            console.log(`Skipped missing folder: ${config.folder}`);
            continue;
        }

        const files = fs.readdirSync(sourceDir).filter(isImageFile);
        for (const fileName of files) {
            processed += 1;

            const sourcePath = path.join(sourceDir, fileName);
            const ext = path.extname(fileName).toLowerCase() || '.jpg';
            const baseName = path.basename(fileName, ext);
            const menuName = toTitleCase(baseName);
            const imageSlug = toSlug(menuName) || `menu-${Date.now()}`;
            const targetFileName = `${config.category}-${imageSlug}${ext}`;
            const targetPath = path.join(uploadsMenuDir, targetFileName);
            const imagePublicPath = `/uploads/menu/${targetFileName}`;

            if (!fs.existsSync(targetPath)) {
                fs.copyFileSync(sourcePath, targetPath);
            }

            const existing = await MenuModel.findOne({
                name: menuName,
                category: config.category,
            });

            if (existing) {
                existing.description = buildDescription(config.descriptionPrefix, menuName);
                existing.price = config.price;
                existing.image = imagePublicPath;
                existing.available = true;
                existing.stock = existing.stock > 0 ? existing.stock : 20;
                existing.availabilityTime = { mode: 'anytime', startTime: null, endTime: null };
                await existing.save();
                updated += 1;
                continue;
            }

            await MenuModel.create({
                name: menuName,
                description: buildDescription(config.descriptionPrefix, menuName),
                price: config.price,
                category: config.category,
                image: imagePublicPath,
                available: true,
                stock: 20,
                availabilityTime: { mode: 'anytime', startTime: null, endTime: null },
            });
            inserted += 1;
        }
    }

    console.log(`Seed complete. Processed: ${processed}, inserted: ${inserted}, updated: ${updated}`);
    await mongoose.disconnect();
}

seedMenus()
    .then(() => {
        process.exit(0);
    })
    .catch(async (error: unknown) => {
        console.error('Menu seed failed:', error);
        try {
            await mongoose.disconnect();
        } catch (_disconnectError) {
            // ignore
        }
        process.exit(1);
    });

export {};
