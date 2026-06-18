/**
 * Integration test: frontend payment schema + FormData POST → inventory deduction.
 * Run: node -r ts-node/register scripts/test-frontend-payment-deduction.ts
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { z } = require('zod');
const InventoryModel = require('../models/Inventory');

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

// Mirrors Project_Sugar/src/schema/paymentSchema.ts
const paymentCartItemSchema = z.object({
    itemId: z.string().optional().default(''),
    name: z.string().trim().min(1),
    quantity: z.number().int().min(1),
    price: z.number().min(0),
    size: z.enum(['Medium', 'Large']).optional(),
    notes: z.string().trim().optional().default(''),
    addOns: z.array(z.object({
        name: z.string().trim().min(1),
        price: z.number().min(0),
    })).optional().default([]),
    lineTotal: z.number().min(0).optional(),
});

const createPaymentSchema = z.object({
    customerName: z.string().trim().min(1),
    orderNumber: z.string().trim().optional().default(''),
    paymentMethod: z.enum(['GCash', 'Maya', 'Bank QR', 'Cash']),
    amount: z.number().min(0),
    cart: z.array(paymentCartItemSchema).min(1),
});

const TRACKED_SKUS = [
    'SC-PW-003', // Matcha Powder
    'SC-CC-005', // 16oz cup (Medium)
    'SC-CC-006', // 22oz cup (Large)
    'SC-CC-007', // Dome Lid
    'SC-SA-001', // Regular Straw
    'SC-TP-007', // Tapioca Pearls (add-on)
];

async function fetchJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    return { response, body };
}

function buildFrontendCartPayload(menu: { _id: string; name: string; price: number }) {
    const unitPrice = menu.price + 15; // base + Extra Pearls add-on (frontend ProductModal)
    return [
        {
            itemId: menu._id,
            name: menu.name,
            quantity: 1,
            price: unitPrice,
            size: 'Medium' as const,
            notes: '',
            addOns: [{ name: 'Extra Pearls', price: 15 }],
            lineTotal: unitPrice,
        },
    ];
}

/** Same shape as usePayment.ts createPaymentMutation FormData */
async function submitFrontendPayment(payload: Record<string, unknown>) {
    const parsed = createPaymentSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(`Frontend schema validation failed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
    }

    const formData = new FormData();
    formData.append('customerName', parsed.data.customerName);
    formData.append('orderNumber', parsed.data.orderNumber ?? '');
    formData.append('paymentMethod', parsed.data.paymentMethod);
    formData.append('amount', String(parsed.data.amount));
    formData.append('cart', JSON.stringify(parsed.data.cart));

    const { response, body } = await fetchJson(`${API_BASE_URL}/payments`, {
        method: 'POST',
        body: formData,
    });

    return { ok: response.ok, status: response.status, body };
}

async function snapshotTrackedStock(): Promise<Map<string, number>> {
    const items = await InventoryModel.find({ skuCode: { $in: TRACKED_SKUS } })
        .select('skuCode stockQuantity')
        .lean();
    return new Map(items.map((item: { skuCode: string; stockQuantity: number }) => [
        String(item.skuCode),
        Number(item.stockQuantity ?? 0),
    ]));
}

function printDiff(before: Map<string, number>, after: Map<string, number>) {
    const lines: string[] = [];
    let passed = true;

    for (const sku of TRACKED_SKUS) {
        const b = before.get(sku) ?? 0;
        const a = after.get(sku) ?? 0;
        const delta = a - b;
        const ok = delta < 0;
        if (!ok && sku !== 'SC-CC-006') passed = false; // Large cup should not change for Medium order
        const marker = delta === 0 ? '—' : delta < 0 ? '✓' : '✗';
        lines.push(`  ${marker} ${sku}: ${b} → ${a} (${delta >= 0 ? '+' : ''}${delta})`);
    }

    console.log(lines.join('\n'));
    return passed;
}

async function main() {
    console.log('=== Frontend payment → inventory deduction test ===\n');

    const health = await fetch(`${API_BASE_URL}/`);
    if (!health.ok) {
        throw new Error(`API not reachable at ${API_BASE_URL}`);
    }

    const { response: menusRes, body: menusBody } = await fetchJson(`${API_BASE_URL}/menus`);
    if (!menusRes.ok) {
        throw new Error(`Failed to fetch menus: ${menusBody?.message ?? menusRes.status}`);
    }

    const menu = (menusBody.menus ?? []).find((m: { name: string }) => m.name === 'Matcha');
    if (!menu) {
        throw new Error('Matcha menu item not found — seed menus first');
    }

    const cart = buildFrontendCartPayload(menu);
    const amount = cart.reduce((sum, line) => sum + line.lineTotal!, 0);

    const paymentInput = {
        customerName: 'Deduction Test Customer',
        orderNumber: `TEST-${Date.now()}`,
        paymentMethod: 'Cash' as const,
        amount,
        cart,
    };

    console.log('1) Frontend schema validation...');
    const parsed = createPaymentSchema.safeParse(paymentInput);
    if (!parsed.success) {
        throw new Error(`Schema invalid: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
    }
    console.log('   OK — cart payload matches createPaymentSchema\n');

    console.log('2) Cart payload (as sent in FormData):');
    console.log(JSON.stringify(cart, null, 2));
    console.log('');

    await mongoose.connect(process.env.MONGO_URI);
    const before = await snapshotTrackedStock();

    console.log('3) Stock BEFORE payment:');
    for (const sku of TRACKED_SKUS) {
        console.log(`   ${sku}: ${before.get(sku) ?? 'N/A'}`);
    }
    console.log('');

    console.log('4) POST /payments (FormData, Cash — same as PaymentPage)...');
    const result = await submitFrontendPayment(paymentInput);

    if (!result.ok) {
        console.error('   FAILED:', result.status, result.body?.message ?? result.body);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`   OK — payment ${result.body.payment?._id} created\n`);

    const after = await snapshotTrackedStock();

    console.log('5) Stock AFTER payment (expected deductions):');
    console.log('   Matcha Powder -28, 16oz Cup -1, Dome Lid -1, Straw -1, Pearls -1');
    console.log('   22oz Cup unchanged (Medium order)\n');

    const stockChanged = printDiff(before, after);

    const expected = {
        'SC-PW-003': -28,
        'SC-CC-005': -1,
        'SC-CC-006': 0,
        'SC-CC-007': -1,
        'SC-SA-001': -1,
        'SC-TP-007': -1,
    };

    let allMatch = true;
    for (const [sku, expectedDelta] of Object.entries(expected)) {
        const b = before.get(sku) ?? 0;
        const a = after.get(sku) ?? 0;
        const actualDelta = a - b;
        if (actualDelta !== expectedDelta) {
            allMatch = false;
            console.log(`\n   MISMATCH ${sku}: expected ${expectedDelta}, got ${actualDelta}`);
        }
    }

    await mongoose.disconnect();

    console.log('\n=== RESULT ===');
    if (result.ok && stockChanged && allMatch) {
        console.log('PASS — Frontend-schema payment deducts inventory correctly.');
        process.exit(0);
    }

    console.log('FAIL — Deduction did not match expectations.');
    process.exit(1);
}

main().catch(async (error) => {
    console.error('Test error:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore
    }
    process.exit(1);
});

export {};
