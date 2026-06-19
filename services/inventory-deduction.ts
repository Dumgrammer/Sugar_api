const mongoose = require('mongoose');
const MenuModel = require('../models/Menu');
const InventoryModel = require('../models/Inventory');

type CartItem = {
    itemId?: string;
    name?: string;
    quantity?: number;
    size?: 'Medium' | 'Large' | null;
    addOns?: Array<{ name?: string }>;
};

type RecipeItem = {
    inventory: { toString(): string } | string;
    quantity: number;
    size?: 'Medium' | 'Large' | 'any';
};

type MenuRecord = {
    _id: unknown;
    name: string;
    category: string;
    recipe?: RecipeItem[];
};

type InventoryRecord = {
    _id: unknown;
    skuCode?: string;
    itemName?: string;
    stockQuantity?: number;
};

const ADD_ON_ALIAS_GROUPS = [
    { name: 'Extra Pearls', aliases: ['Extra Pearls', 'Pearls', 'Tapioca Pearls'] },
    { name: 'Nata', aliases: ['Nata', 'Nata de Coco'] },
    { name: 'Cream Puffs', aliases: ['Cream Puffs'] },
    { name: 'Whipped Cream', aliases: ['Whipped Cream'] },
];

const DRINK_CATEGORIES = new Set(['coffee', 'milk-tea']);

const SIZE_CUP_SKU: Record<'Medium' | 'Large', string> = {
    Medium: 'SC-CC-005',
    Large: 'SC-CC-006',
};

const SIZE_STRAW_SKU: Record<'Medium' | 'Large', string> = {
    Medium: 'SC-SA-001',
    Large: 'SC-SA-002',
};

const DOME_LID_SKU = 'SC-CC-007';

const NAME_POWDER_SKU: Array<{ pattern: RegExp; sku: string }> = [
    { pattern: /matcha/i, sku: 'SC-PW-003' },
    { pattern: /taro/i, sku: 'SC-PW-004' },
    { pattern: /okinawa/i, sku: 'SC-PW-006' },
    { pattern: /wintermelon/i, sku: 'SC-PW-007' },
    { pattern: /chocolate|java chip|oreo|mango|strawberr|red velvet|vanilla|caramel|french|cappucino|americano|darkoreo|matchacream|mangolava|oreo cream/i, sku: 'SC-PW-005' },
];

const DRINK_BASE_SKU_QTY: Array<{ sku: string; quantity: number; size?: 'Medium' | 'Large' | 'any' }> = [
    { sku: 'SC-MC-001', quantity: 0.12, size: 'any' },
    { sku: 'SC-IW-001', quantity: 0.15, size: 'any' },
    { sku: 'SC-IW-003', quantity: 0.05, size: 'any' },
    { sku: 'SC-SS-001', quantity: 0.01, size: 'any' },
];

const COFFEE_EXTRA_SKU_QTY: Array<{ sku: string; quantity: number }> = [
    { sku: 'SC-CF-003', quantity: 8 },
];

const SNACK_DEFAULT_SKU_QTY: Array<{ sku: string; quantity: number }> = [
    { sku: 'SC-PK-001', quantity: 1 },
];

function normalizeName(value: string): string {
    return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAddOnAliases(addOnName: string): string[] {
    const normalized = normalizeName(addOnName);
    const match = ADD_ON_ALIAS_GROUPS.find((group) =>
        group.aliases.some((alias) => normalizeName(alias) === normalized)
            || normalizeName(group.name) === normalized
    );
    return match ? match.aliases : [addOnName];
}

function recipeMatchesSize(recipeSize: string | undefined, orderSize: 'Medium' | 'Large' | null | undefined): boolean {
    const size = recipeSize ?? 'any';
    if (size === 'any') return true;
    if (!orderSize) return size === 'Medium';
    return size === orderSize;
}

function addDeduction(
    deductions: Map<string, number>,
    inventoryId: string,
    quantity: number
): void {
    if (!mongoose.Types.ObjectId.isValid(inventoryId) || quantity <= 0) return;
    const key = String(inventoryId);
    deductions.set(key, (deductions.get(key) ?? 0) + quantity);
}

function addSkuDeduction(
    deductions: Map<string, number>,
    skuById: Map<string, string>,
    sku: string,
    quantity: number
): void {
    const inventoryId = skuById.get(sku.toUpperCase());
    if (!inventoryId) return;
    addDeduction(deductions, inventoryId, quantity);
}

function resolvePowderSku(menuName: string): string {
    const match = NAME_POWDER_SKU.find((entry) => entry.pattern.test(menuName));
    return match?.sku ?? 'SC-PW-005';
}

function applyDefaultDrinkRecipe(
    deductions: Map<string, number>,
    skuById: Map<string, string>,
    menu: { name: string; category: string },
    orderSize: 'Medium' | 'Large' | null | undefined,
    lineQuantity: number
): void {
    const size: 'Medium' | 'Large' = orderSize === 'Large' ? 'Large' : 'Medium';

    addSkuDeduction(deductions, skuById, resolvePowderSku(menu.name), 25 * lineQuantity);
    for (const item of DRINK_BASE_SKU_QTY) {
        if (!recipeMatchesSize(item.size, size)) continue;
        addSkuDeduction(deductions, skuById, item.sku, item.quantity * lineQuantity);
    }
    if (menu.category === 'coffee') {
        for (const item of COFFEE_EXTRA_SKU_QTY) {
            addSkuDeduction(deductions, skuById, item.sku, item.quantity * lineQuantity);
        }
    }

    addSkuDeduction(deductions, skuById, SIZE_CUP_SKU[size], 1 * lineQuantity);
    addSkuDeduction(deductions, skuById, DOME_LID_SKU, 1 * lineQuantity);
    addSkuDeduction(deductions, skuById, SIZE_STRAW_SKU[size], 1 * lineQuantity);
}

function applyMenuRecipe(
    deductions: Map<string, number>,
    recipe: RecipeItem[],
    orderSize: 'Medium' | 'Large' | null | undefined,
    lineQuantity: number
): void {
    for (const item of recipe) {
        if (!recipeMatchesSize(item.size, orderSize)) continue;
        const inventoryId = String(item.inventory);
        addDeduction(deductions, inventoryId, item.quantity * lineQuantity);
    }
}

function applyAddOnDeductions(
    deductions: Map<string, number>,
    nameToId: Map<string, string>,
    cart: CartItem[]
): void {
    const addOnCounts = new Map<string, { aliases: string[]; quantity: number }>();

    for (const item of cart) {
        const itemQuantity = Number(item?.quantity ?? 0);
        if (!Number.isFinite(itemQuantity) || itemQuantity <= 0) continue;
        const addOns = Array.isArray(item?.addOns) ? item.addOns : [];
        for (const addOn of addOns) {
            if (!addOn?.name) continue;
            const aliases = resolveAddOnAliases(String(addOn.name));
            const key = normalizeName(aliases[0] ?? String(addOn.name));
            const existing = addOnCounts.get(key);
            if (existing) {
                existing.quantity += itemQuantity;
            } else {
                addOnCounts.set(key, { aliases, quantity: itemQuantity });
            }
        }
    }

    for (const { aliases, quantity } of addOnCounts.values()) {
        const inventoryId = aliases
            .map((alias) => nameToId.get(normalizeName(alias)))
            .find(Boolean);
        if (inventoryId) {
            addDeduction(deductions, inventoryId, quantity);
        }
    }
}

async function loadInventoryLookups(): Promise<{
    skuById: Map<string, string>;
    nameToId: Map<string, string>;
}> {
    const inventories = await InventoryModel.find().select('_id skuCode itemName').lean();
    const skuById = new Map<string, string>();
    const nameToId = new Map<string, string>();

    for (const item of inventories as InventoryRecord[]) {
        const id = String(item._id);
        if (item.skuCode) {
            skuById.set(String(item.skuCode).toUpperCase(), id);
        }
        if (item.itemName) {
            nameToId.set(normalizeName(String(item.itemName)), id);
        }
    }

    return { skuById, nameToId };
}

async function buildCartDeductions(cart: CartItem[]): Promise<Map<string, number>> {
    const deductions = new Map<string, number>();
    const { skuById, nameToId } = await loadInventoryLookups();

    const menuIds = cart
        .map((item) => item.itemId)
        .filter((id): id is string => Boolean(id && mongoose.Types.ObjectId.isValid(id)));

    const menus = menuIds.length
        ? await MenuModel.find({ _id: { $in: menuIds } }).select('name category recipe').lean()
        : [];
    const menuById = new Map<string, MenuRecord>(
        (menus as MenuRecord[]).map((menu) => [String(menu._id), menu])
    );

    for (const item of cart) {
        const lineQuantity = Number(item?.quantity ?? 0);
        if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) continue;

        const menu = item.itemId ? menuById.get(String(item.itemId)) : undefined;
        const orderSize = item.size ?? null;

        if (menu && Array.isArray(menu.recipe) && menu.recipe.length > 0) {
            applyMenuRecipe(deductions, menu.recipe, orderSize, lineQuantity);
            continue;
        }

        if (menu && DRINK_CATEGORIES.has(menu.category)) {
            applyDefaultDrinkRecipe(deductions, skuById, menu, orderSize, lineQuantity);
            continue;
        }

        if (menu?.category === 'snacks') {
            for (const snackItem of SNACK_DEFAULT_SKU_QTY) {
                addSkuDeduction(deductions, skuById, snackItem.sku, snackItem.quantity * lineQuantity);
            }
        }
    }

    applyAddOnDeductions(deductions, nameToId, cart);
    return deductions;
}

async function validateStock(deductions: Map<string, number>): Promise<void> {
    if (!deductions.size) return;

    const inventoryIds = [...deductions.keys()];
    const inventories = await InventoryModel.find({ _id: { $in: inventoryIds } })
        .select('itemName stockQuantity')
        .lean();
    const inventoryById = new Map(
        (inventories as InventoryRecord[]).map((item) => [String(item._id), item])
    );

    const shortages: string[] = [];
    for (const [inventoryId, requiredQty] of deductions.entries()) {
        const inventory = inventoryById.get(inventoryId);
        if (!inventory) {
            shortages.push(`Unknown inventory item (${inventoryId})`);
            continue;
        }
        const available = Number(inventory.stockQuantity ?? 0);
        if (available < requiredQty) {
            shortages.push(
                `${inventory.itemName ?? 'Item'}: need ${requiredQty}, only ${available} in stock`
            );
        }
    }

    if (shortages.length > 0) {
        const error = new Error(`Insufficient inventory: ${shortages.join('; ')}`);
        (error as any).statusCode = 409;
        throw error;
    }
}

async function applyDeductions(deductions: Map<string, number>): Promise<void> {
    const updates = [...deductions.entries()].map(([inventoryId, quantity]) =>
        InventoryModel.updateOne(
            { _id: inventoryId },
            { $inc: { stockQuantity: -quantity } }
        )
    );
    await Promise.all(updates);
}

async function validateCartInventory(cart: CartItem[]): Promise<Map<string, number>> {
    const deductions = await buildCartDeductions(cart);
    await validateStock(deductions);
    return deductions;
}

async function deductInventoryForCart(cart: CartItem[]): Promise<void> {
    const deductions = await validateCartInventory(cart);
    await applyDeductions(deductions);
}

module.exports = {
    buildCartDeductions,
    validateCartInventory,
    deductInventoryForCart,
    validateStock,
    applyDeductions,
    ADD_ON_ALIAS_GROUPS,
    resolveAddOnAliases,
    escapeRegExp,
};

export {};
