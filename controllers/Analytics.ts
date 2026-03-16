import type { Request, Response } from 'express';

const PaymentModel = require('../models/Payment');

type Period = 'daily' | 'weekly' | 'monthly';

function startOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function endOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
}

function startOfWeek(date: Date): Date {
    const value = startOfDay(date);
    const day = value.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    value.setDate(value.getDate() + diff);
    return value;
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function toAmount(value: unknown): number {
    return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function toQuantity(value: unknown): number {
    return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function aggregateTopItems(payments: any[], topN: number) {
    const soldMap: Record<string, number> = {};

    for (const payment of payments) {
        const cart = Array.isArray(payment.cart) ? payment.cart : [];
        for (const item of cart) {
            const name = typeof item?.name === 'string' ? item.name.trim() : '';
            if (!name) continue;
            soldMap[name] = (soldMap[name] ?? 0) + toQuantity(item?.quantity);
        }
    }

    return Object.entries(soldMap)
        .map(([name, sold]) => ({ name, sold }))
        .sort((a, b) => b.sold - a.sold)
        .slice(0, topN);
}

function aggregatePaymentMethods(payments: any[]) {
    const countMap: Record<string, number> = {
        GCash: 0,
        Maya: 0,
        'Bank QR': 0,
        Cash: 0,
    };

    for (const payment of payments) {
        const method = typeof payment?.paymentMethod === 'string' ? payment.paymentMethod : '';
        if (method in countMap) {
            countMap[method] += 1;
        }
    }

    const total = Object.values(countMap).reduce((sum, value) => sum + value, 0);
    const fallbackTotal = total > 0 ? total : 1;

    return Object.entries(countMap).map(([name, count]) => ({
        name,
        value: Math.round((count / fallbackTotal) * 100),
        count,
    }));
}

function buildDailySeries(payments: any[]) {
    const points = Array.from({ length: 24 }, (_, h) => ({
        time: `${String(h).padStart(2, '0')}:00`,
        sales: 0,
    }));

    for (const payment of payments) {
        const createdAt = new Date(payment?.createdAt);
        if (Number.isNaN(createdAt.getTime())) continue;
        const hour = createdAt.getHours();
        points[hour].sales += toAmount(payment?.amount);
    }

    return points;
}

function buildWeeklySeries(payments: any[]) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totals = labels.map((day) => ({ day, sales: 0 }));

    for (const payment of payments) {
        const createdAt = new Date(payment?.createdAt);
        if (Number.isNaN(createdAt.getTime())) continue;
        const jsDay = createdAt.getDay();
        const index = jsDay === 0 ? 6 : jsDay - 1;
        totals[index].sales += toAmount(payment?.amount);
    }

    return totals;
}

function buildMonthlySeries(payments: any[]) {
    const byWeek: Record<string, number> = {
        'Week 1': 0,
        'Week 2': 0,
        'Week 3': 0,
        'Week 4': 0,
        'Week 5': 0,
    };

    for (const payment of payments) {
        const createdAt = new Date(payment?.createdAt);
        if (Number.isNaN(createdAt.getTime())) continue;
        const day = createdAt.getDate();
        const weekIndex = Math.min(5, Math.ceil(day / 7));
        const key = `Week ${weekIndex}`;
        byWeek[key] += toAmount(payment?.amount);
    }

    return Object.entries(byWeek).map(([week, sales]) => ({ week, sales }));
}

function percentageChange(current: number, previous: number): string {
    if (previous <= 0) {
        return current > 0 ? '+100%' : '0%';
    }
    const value = ((current - previous) / previous) * 100;
    const rounded = Math.round(value * 10) / 10;
    return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

exports.getDashboardAnalytics = async (_req: Request, res: Response) => {
    try {
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        const [todayPayments, recentPayments] = await Promise.all([
            PaymentModel.find({ createdAt: { $gte: todayStart, $lte: todayEnd } }).sort({ createdAt: -1 }),
            PaymentModel.find().sort({ createdAt: -1 }).limit(8),
        ]);

        const revenueToday = todayPayments.reduce((sum: number, p: any) => sum + toAmount(p.amount), 0);
        const ordersToday = todayPayments.length;
        const inProgressToday = todayPayments.filter((p: any) => p.status === 'received' || p.status === 'preparing').length;
        const completedToday = todayPayments.filter((p: any) => p.status === 'completed').length;
        const topItems = aggregateTopItems(todayPayments, 5);
        const bestSeller = topItems[0]?.name ?? 'No sales yet';
        const hourlySales = buildDailySeries(todayPayments);

        return res.status(200).json({
            message: 'Dashboard analytics fetched successfully',
            data: {
                summary: {
                    revenueToday,
                    ordersToday,
                    inProgressToday,
                    completedToday,
                    bestSeller,
                    topItems,
                },
                hourlySales,
                recentOrders: recentPayments,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch dashboard analytics' });
    }
};

exports.getSalesAnalytics = async (req: Request, res: Response) => {
    try {
        const period = (req.query.period as Period) || 'daily';
        const now = new Date();
        const currentStart = period === 'daily'
            ? startOfDay(now)
            : period === 'weekly'
                ? startOfWeek(now)
                : startOfMonth(now);

        const previousStart = new Date(currentStart);
        let previousEnd = new Date(currentStart.getTime() - 1);

        if (period === 'daily') {
            previousStart.setDate(previousStart.getDate() - 1);
        } else if (period === 'weekly') {
            previousStart.setDate(previousStart.getDate() - 7);
        } else {
            previousStart.setMonth(previousStart.getMonth() - 1);
        }

        const [currentPayments, previousPayments] = await Promise.all([
            PaymentModel.find({ createdAt: { $gte: currentStart } }).sort({ createdAt: 1 }),
            PaymentModel.find({ createdAt: { $gte: previousStart, $lte: previousEnd } }),
        ]);

        const revenue = currentPayments.reduce((sum: number, p: any) => sum + toAmount(p.amount), 0);
        const orders = currentPayments.length;
        const averagePerOrder = orders > 0 ? Math.round(revenue / orders) : 0;

        const previousRevenue = previousPayments.reduce((sum: number, p: any) => sum + toAmount(p.amount), 0);
        const previousOrders = previousPayments.length;

        const revenueChange = percentageChange(revenue, previousRevenue);
        const orderChangeValue = orders - previousOrders;
        const orderChange = `${orderChangeValue >= 0 ? '+' : ''}${orderChangeValue}`;

        const revenueSeries = period === 'daily'
            ? buildDailySeries(currentPayments)
            : period === 'weekly'
                ? buildWeeklySeries(currentPayments)
                : buildMonthlySeries(currentPayments);

        const paymentMethods = aggregatePaymentMethods(currentPayments);
        const bestSelling = aggregateTopItems(currentPayments, 5);

        return res.status(200).json({
            message: 'Sales analytics fetched successfully',
            data: {
                period,
                summary: {
                    revenue,
                    orders,
                    averagePerOrder,
                    revenueChange,
                    orderChange,
                },
                revenueSeries,
                paymentMethods,
                bestSelling,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch sales analytics' });
    }
};

function startOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function formatCsvDate(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

function escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function resolveRange(req: Request): { rangeStart: Date; rangeEnd: Date; rangeLabel: string } | null {
    const period = req.query.period as string | undefined;
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date = endOfDay(now);
    let rangeLabel: string;

    if (fromParam && toParam) {
        rangeStart = startOfDay(new Date(fromParam));
        rangeEnd = endOfDay(new Date(toParam));
        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
            return null;
        }
        rangeLabel = `${fromParam}_to_${toParam}`;
    } else if (period === 'yearly') {
        rangeStart = startOfYear(now);
        rangeLabel = `yearly_${now.getFullYear()}`;
    } else if (period === 'monthly') {
        rangeStart = startOfMonth(now);
        rangeLabel = `monthly_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else {
        rangeStart = startOfWeek(now);
        rangeLabel = 'weekly';
    }

    return { rangeStart, rangeEnd, rangeLabel };
}

function buildCsv(
    rangeLabel: string,
    now: Date,
    totalRevenue: number,
    totalOrders: number,
    methodStats: ReturnType<typeof aggregatePaymentMethods>,
    topItems: ReturnType<typeof aggregateTopItems>,
    payments: any[],
): string {
    const lines: string[] = [];

    lines.push('Sugar Cafe Sales Report');
    lines.push(`Period,${escapeCsv(rangeLabel)}`);
    lines.push(`Generated,${formatCsvDate(now)}`);
    lines.push(`Total Revenue,${totalRevenue}`);
    lines.push(`Total Orders,${totalOrders}`);
    lines.push(`Average per Order,${totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0}`);
    lines.push('');

    lines.push('Payment Methods');
    lines.push('Method,Count,Percentage');
    for (const m of methodStats) {
        lines.push(`${escapeCsv(m.name)},${m.count},${m.value}%`);
    }
    lines.push('');

    lines.push('Top Selling Items');
    lines.push('Item,Quantity Sold');
    for (const item of topItems) {
        lines.push(`${escapeCsv(item.name)},${item.sold}`);
    }
    lines.push('');

    lines.push('Order Details');
    lines.push('Date,Order Number,Customer,Payment Method,Amount,Items,Status,Payment Confirmed');
    for (const p of payments) {
        const cart = Array.isArray(p.cart) ? p.cart : [];
        const itemSummary = cart.map((i: any) => `${i.quantity}x ${i.name}`).join('; ');
        lines.push([
            formatCsvDate(new Date(p.createdAt)),
            escapeCsv(p.orderNumber || p._id.toString().slice(-8)),
            escapeCsv(p.customerName || ''),
            escapeCsv(p.paymentMethod || ''),
            toAmount(p.amount),
            escapeCsv(itemSummary),
            escapeCsv(p.status || ''),
            p.paymentConfirmed ? 'Yes' : 'No',
        ].join(','));
    }

    return lines.join('\n');
}

function buildPdf(
    rangeLabel: string,
    now: Date,
    totalRevenue: number,
    totalOrders: number,
    methodStats: ReturnType<typeof aggregatePaymentMethods>,
    topItems: ReturnType<typeof aggregateTopItems>,
    payments: any[],
): any {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const brown = '#78553B';
    const dark = '#1C1917';
    const muted = '#A8A29E';

    doc.fontSize(22).fillColor(brown).text('Sugar Cafe', { continued: true });
    doc.fillColor(dark).text(' Sales Report');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(muted).text(`Period: ${rangeLabel.replace(/_/g, ' ')}  |  Generated: ${formatCsvDate(now)}`);
    doc.moveDown(1);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#E5E0DB').lineWidth(0.5).stroke();
    doc.moveDown(0.8);

    const avgPerOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    doc.fontSize(10).fillColor(dark).text('Summary', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(dark);
    doc.text(`Total Revenue:  PHP ${totalRevenue.toLocaleString()}`);
    doc.text(`Total Orders:  ${totalOrders}`);
    doc.text(`Average per Order:  PHP ${avgPerOrder.toLocaleString()}`);
    doc.moveDown(1);

    doc.fontSize(10).fillColor(dark).text('Payment Methods', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(dark);
    for (const m of methodStats) {
        doc.text(`${m.name}:  ${m.count} orders (${m.value}%)`);
    }
    doc.moveDown(1);

    if (topItems.length > 0) {
        doc.fontSize(10).fillColor(dark).text('Top Selling Items', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor(dark);
        topItems.forEach((item, idx) => {
            doc.text(`${idx + 1}. ${item.name}  —  ${item.sold} sold`);
        });
        doc.moveDown(1);
    }

    doc.fontSize(10).fillColor(dark).text('Order Details', { underline: true });
    doc.moveDown(0.5);

    const colX = [40, 110, 200, 290, 345, 400, 475];
    const headers = ['Date', 'Order #', 'Customer', 'Method', 'Amount', 'Status', 'Confirmed'];

    doc.fontSize(7).fillColor(brown);
    headers.forEach((h, i) => {
        doc.text(h, colX[i], doc.y, { continued: i < headers.length - 1, width: (colX[i + 1] || 555) - colX[i] });
    });
    doc.text('');
    doc.moveDown(0.2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#E5E0DB').lineWidth(0.3).stroke();
    doc.moveDown(0.2);

    doc.fontSize(7).fillColor(dark);
    for (const p of payments) {
        if (doc.y > 750) {
            doc.addPage();
            doc.fontSize(7).fillColor(dark);
        }

        const rowY = doc.y;
        const d = new Date(p.createdAt);
        const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        doc.text(dateStr, colX[0], rowY, { width: colX[1] - colX[0] });
        doc.text(p.orderNumber || p._id.toString().slice(-8), colX[1], rowY, { width: colX[2] - colX[1] });
        doc.text((p.customerName || '').substring(0, 14), colX[2], rowY, { width: colX[3] - colX[2] });
        doc.text(p.paymentMethod || '', colX[3], rowY, { width: colX[4] - colX[3] });
        doc.text(`PHP ${toAmount(p.amount)}`, colX[4], rowY, { width: colX[5] - colX[4] });
        doc.text(p.status || '', colX[5], rowY, { width: colX[6] - colX[5] });
        doc.text(p.paymentConfirmed ? 'Yes' : 'No', colX[6], rowY, { width: 555 - colX[6] });

        doc.y = rowY + 12;
    }

    if (payments.length === 0) {
        doc.fontSize(9).fillColor(muted).text('No orders in this period.');
    }

    doc.end();
    return doc;
}

exports.exportAnalytics = async (req: Request, res: Response) => {
    try {
        const resolved = resolveRange(req);
        if (!resolved) {
            return res.status(400).json({ message: 'Invalid date range. Use YYYY-MM-DD format.' });
        }

        const { rangeStart, rangeEnd, rangeLabel } = resolved;
        const format = (req.query.format as string) === 'pdf' ? 'pdf' : 'csv';
        const now = new Date();

        const payments = await PaymentModel
            .find({ createdAt: { $gte: rangeStart, $lte: rangeEnd } })
            .sort({ createdAt: 1 });

        const totalRevenue = payments.reduce((sum: number, p: any) => sum + toAmount(p.amount), 0);
        const totalOrders = payments.length;
        const topItems = aggregateTopItems(payments, 10);
        const methodStats = aggregatePaymentMethods(payments);

        if (format === 'pdf') {
            const filename = `sugar_cafe_report_${rangeLabel}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            const pdfDoc = buildPdf(rangeLabel, now, totalRevenue, totalOrders, methodStats, topItems, payments);
            pdfDoc.pipe(res);
            return;
        }

        const csv = buildCsv(rangeLabel, now, totalRevenue, totalOrders, methodStats, topItems, payments);
        const filename = `sugar_cafe_report_${rangeLabel}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to export analytics' });
    }
};

export {};
