/**
 * Seeds 3 simple Cash orders via POST /payments and verifies audit log entries.
 * Run: npm run seed:sample-orders
 */
require('dotenv').config();
const mongoose = require('mongoose');
const AuditLogModel = require('../models/AuditLog');

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

const CUSTOMERS = ['Audit Test Alice', 'Audit Test Bob', 'Audit Test Carol'];

async function fetchJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    return { response, body };
}

function buildSimpleCart(menu: { _id: string; name: string; price: number }) {
    return [
        {
            itemId: menu._id,
            name: menu.name,
            quantity: 1,
            price: menu.price,
            size: 'Medium' as const,
            notes: '',
            addOns: [],
            lineTotal: menu.price,
        },
    ];
}

async function submitCashOrder(payload: {
    customerName: string;
    orderNumber: string;
    amount: number;
    cart: ReturnType<typeof buildSimpleCart>;
}) {
    const formData = new FormData();
    formData.append('customerName', payload.customerName);
    formData.append('orderNumber', payload.orderNumber);
    formData.append('paymentMethod', 'Cash');
    formData.append('amount', String(payload.amount));
    formData.append('cart', JSON.stringify(payload.cart));

    const { response, body } = await fetchJson(`${API_BASE_URL}/payments`, {
        method: 'POST',
        body: formData,
    });

    return { ok: response.ok, status: response.status, body };
}

async function main() {
    console.log('=== Seed 3 sample orders + audit check ===\n');

    const health = await fetch(`${API_BASE_URL}/`);
    if (!health.ok) {
        throw new Error(`API not reachable at ${API_BASE_URL} — start the server first.`);
    }

    const { response: menusRes, body: menusBody } = await fetchJson(`${API_BASE_URL}/menus`);
    if (!menusRes.ok) {
        throw new Error(`Failed to fetch menus: ${menusBody?.message ?? menusRes.status}`);
    }

    const menus = (menusBody.menus ?? []).filter(
        (m: { available?: boolean; name?: string }) => m.available !== false && m.name
    );
    if (menus.length === 0) {
        throw new Error('No menu items found — run npm run seed:menu first.');
    }

    const pickedMenus = [0, 1, 2].map((i) => menus[i % menus.length]);
    const runId = Date.now();
    const createdPayments: Array<{ id: string; orderNumber: string; customerName: string }> = [];

    console.log(`Using menus: ${pickedMenus.map((m: { name: string }) => m.name).join(', ')}\n`);

    for (let i = 0; i < 3; i++) {
        const menu = pickedMenus[i];
        const cart = buildSimpleCart(menu);
        const amount = menu.price;
        const orderNumber = `AUDIT-${runId}-${i + 1}`;

        console.log(`${i + 1}/3 Placing order ${orderNumber} for ${CUSTOMERS[i]} (${menu.name}, Cash, PHP ${amount})...`);

        const result = await submitCashOrder({
            customerName: CUSTOMERS[i],
            orderNumber,
            amount,
            cart,
        });

        if (!result.ok) {
            console.error('   FAILED:', result.status, result.body?.message ?? result.body);
            if (result.body?.errors) {
                console.error('   Errors:', JSON.stringify(result.body.errors, null, 2));
            }
            process.exit(1);
        }

        const paymentId = result.body.payment?._id;
        createdPayments.push({
            id: String(paymentId),
            orderNumber,
            customerName: CUSTOMERS[i],
        });
        console.log(`   OK — payment ${paymentId}\n`);
    }

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not set in .env');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const paymentIds = createdPayments.map((p) => p.id);
    const auditLogs = await AuditLogModel.find({
        entityId: { $in: paymentIds },
    })
        .sort({ createdAt: 1 })
        .lean();

    console.log('--- Audit log entries for these orders ---\n');

    if (auditLogs.length === 0) {
        console.log('No audit entries found yet — ensure the API was restarted after adding audit logging.\n');
        await mongoose.disconnect();
        process.exit(1);
    }

    for (const log of auditLogs) {
        const time = new Date(log.createdAt).toISOString();
        console.log(`[${time}] ${log.category}/${log.action} (${log.status})`);
        console.log(`  ${log.summary}`);
        if (log.entityId) {
            console.log(`  entity: ${log.entityType} ${log.entityId}`);
        }
        console.log('');
    }

    const byPayment = new Map<string, typeof auditLogs>();
    for (const log of auditLogs) {
        const key = String(log.entityId);
        if (!byPayment.has(key)) byPayment.set(key, []);
        byPayment.get(key)!.push(log);
    }

    let allGood = true;
    for (const payment of createdPayments) {
        const entries = byPayment.get(payment.id) ?? [];
        const hasOrder = entries.some((e: { action: string }) => e.action === 'order_placed');
        const hasDeduction = entries.some((e: { action: string }) => e.action === 'stock_deducted');

        const status = hasOrder && hasDeduction ? 'OK' : 'MISSING';
        if (status !== 'OK') allGood = false;

        console.log(
            `Order ${payment.orderNumber}: ${entries.length} audit entries — order_placed=${hasOrder ? 'yes' : 'no'}, stock_deducted=${hasDeduction ? 'yes' : 'no'} [${status}]`
        );
    }

    await mongoose.disconnect();

    console.log('\n=== RESULT ===');
    if (allGood && auditLogs.length >= 6) {
        console.log(`PASS — 3 orders created, ${auditLogs.length} audit entries logged.`);
        console.log('Open /admin/audit or /super-admin/audit in the app to view the trail.');
        process.exit(0);
    }

    if (allGood) {
        console.log(`PASS — 3 orders created, ${auditLogs.length} audit entries logged.`);
        process.exit(0);
    }

    console.log('FAIL — Some orders are missing expected audit entries.');
    process.exit(1);
}

main().catch(async (error) => {
    console.error('Script error:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore
    }
    process.exit(1);
});

export {};
