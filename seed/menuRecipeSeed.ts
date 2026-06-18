const dotenv = require('dotenv');
const mongoose = require('mongoose');
const MenuModel = require('../models/Menu');
const InventoryModel = require('../models/Inventory');

dotenv.config();

type RecipeSeedItem = {
    sku: string;
    quantity: number;
    size?: 'Medium' | 'Large' | 'any';
};

const DRINK_BASE: RecipeSeedItem[] = [
    { sku: 'SC-MC-001', quantity: 0.12, size: 'any' },
    { sku: 'SC-IW-001', quantity: 0.15, size: 'any' },
    { sku: 'SC-IW-003', quantity: 0.05, size: 'any' },
    { sku: 'SC-SS-001', quantity: 0.01, size: 'any' },
    { sku: 'SC-CC-005', quantity: 1, size: 'Medium' },
    { sku: 'SC-CC-006', quantity: 1, size: 'Large' },
    { sku: 'SC-CC-007', quantity: 1, size: 'any' },
    { sku: 'SC-SA-001', quantity: 1, size: 'Medium' },
    { sku: 'SC-SA-002', quantity: 1, size: 'Large' },
];

const NAME_POWDER: Array<{ pattern: RegExp; sku: string; quantity?: number }> = [
    { pattern: /matcha/i, sku: 'SC-PW-003', quantity: 28 },
    { pattern: /taro/i, sku: 'SC-PW-004', quantity: 28 },
    { pattern: /okinawa/i, sku: 'SC-PW-006', quantity: 28 },
    { pattern: /wintermelon/i, sku: 'SC-PW-007', quantity: 28 },
    { pattern: /chocolate|java chip|oreo|mango|strawberr|red velvet|vanilla|caramel|french|cappucino|americano|darkoreo|matchacream|mangolava|oreo cream|mangomilktea/i, sku: 'SC-PW-005', quantity: 25 },
];

const COFFEE_EXTRA: RecipeSeedItem[] = [
    { sku: 'SC-CF-003', quantity: 8, size: 'any' },
];

const SNACK_RECIPE: RecipeSeedItem[] = [
    { sku: 'SC-PK-001', quantity: 1, size: 'any' },
];

function buildDrinkRecipe(menuName: string, category: string): RecipeSeedItem[] {
    const powder = NAME_POWDER.find((entry) => entry.pattern.test(menuName));
    const recipe: RecipeSeedItem[] = [];
    if (powder) {
        recipe.push({ sku: powder.sku, quantity: powder.quantity ?? 25, size: 'any' });
    } else if (category === 'milk-tea') {
        recipe.push({ sku: 'SC-PW-005', quantity: 25, size: 'any' });
    }
    if (category === 'coffee') {
        recipe.push(...COFFEE_EXTRA);
    }
    recipe.push(...DRINK_BASE);
    return recipe;
}

async function seedMenuRecipes(): Promise<void> {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI is not configured in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const inventories = await InventoryModel.find().select('_id skuCode').lean();
    const skuToId = new Map(
        inventories.map((item: any) => [String(item.skuCode).toUpperCase(), String(item._id)])
    );

    const menus = await MenuModel.find().select('name category recipe').lean();
    let updated = 0;

    for (const menu of menus) {
        const category = String(menu.category ?? '');
        let seedItems: RecipeSeedItem[] = [];

        if (category === 'coffee' || category === 'milk-tea') {
            seedItems = buildDrinkRecipe(String(menu.name), category);
        } else if (category === 'snacks') {
            seedItems = SNACK_RECIPE;
        }

        if (!seedItems.length) continue;

        const recipe = seedItems
            .map((item) => {
                const inventory = skuToId.get(item.sku.toUpperCase());
                if (!inventory) return null;
                return {
                    inventory,
                    quantity: item.quantity,
                    size: item.size ?? 'any',
                };
            })
            .filter(Boolean);

        if (!recipe.length) continue;

        await MenuModel.updateOne({ _id: menu._id }, { $set: { recipe } });
        updated += 1;
        console.log(`Recipe set for: ${menu.name} (${category}) — ${recipe.length} items`);
    }

    console.log(`Menu recipe seed complete. Updated ${updated} of ${menus.length} menus.`);
    await mongoose.disconnect();
}

seedMenuRecipes()
    .then(() => process.exit(0))
    .catch(async (error: unknown) => {
        console.error('Menu recipe seed failed:', error);
        try {
            await mongoose.disconnect();
        } catch (_disconnectError) {
            // ignore
        }
        process.exit(1);
    });

export {};
