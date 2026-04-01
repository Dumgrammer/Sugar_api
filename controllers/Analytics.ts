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

function toBoolean(value: unknown): boolean {
    return Boolean(value);
}

function buildDashboardAlerts(todayPayments: any[]): Array<{ level: 'info' | 'warning'; title: string; message: string }> {
    const alerts: Array<{ level: 'info' | 'warning'; title: string; message: string }> = [];
    const pendingConfirmations = todayPayments.filter((p: any) => !toBoolean(p?.paymentConfirmed)).length;
    const inProgress = todayPayments.filter((p: any) => p?.status === 'received' || p?.status === 'preparing').length;
    const completed = todayPayments.filter((p: any) => p?.status === 'completed').length;

    if (todayPayments.length === 0) {
        alerts.push({
            level: 'info',
            title: 'No Orders Yet',
            message: 'No orders have been placed today.',
        });
        return alerts;
    }

    if (pendingConfirmations > 0) {
        alerts.push({
            level: 'warning',
            title: 'Pending Payment Confirmation',
            message: `${pendingConfirmations} order(s) still need payment confirmation.`,
        });
    }

    if (inProgress > 0) {
        alerts.push({
            level: 'info',
            title: 'Orders In Progress',
            message: `${inProgress} order(s) are currently being prepared.`,
        });
    }

    alerts.push({
        level: 'info',
        title: 'Completed Orders',
        message: `${completed} order(s) completed today.`,
    });

    return alerts.slice(0, 4);
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
        const alerts = buildDashboardAlerts(todayPayments);

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
                alerts,
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
    const avgPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    lines.push('SUGAR CAFE SALES REPORT');
    lines.push(`Report Period,${escapeCsv(rangeLabel.replace(/_/g, ' '))}`);
    lines.push(`Generated At,${formatCsvDate(now)}`);
    lines.push('');

    lines.push('SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Total Revenue,${totalRevenue.toFixed(2)}`);
    lines.push(`Total Orders,${totalOrders}`);
    lines.push(`Average per Order,${avgPerOrder.toFixed(2)}`);
    lines.push('');

    lines.push('PAYMENT METHODS');
    lines.push('Method,Order Count,Share (%)');
    for (const m of methodStats) {
        lines.push(`${escapeCsv(m.name)},${m.count},${m.value}`);
    }
    lines.push('');

    lines.push('TOP SELLING ITEMS');
    lines.push('Item,Quantity Sold');
    for (const item of topItems) {
        lines.push(`${escapeCsv(item.name)},${item.sold}`);
    }
    lines.push('');

    lines.push('ORDER DETAILS');
    lines.push('Date,Order Number,Customer,Payment Method,Item Count,Amount,Status,Payment Confirmed');
    let totalItemCount = 0;
    for (const p of payments) {
        const cart = Array.isArray(p.cart) ? p.cart : [];
        const itemCount = cart.reduce((sum: number, i: any) => sum + toQuantity(i?.quantity), 0);
        totalItemCount += itemCount;
        lines.push([
            formatCsvDate(new Date(p.createdAt)),
            escapeCsv(p.orderNumber || p._id.toString().slice(-8)),
            escapeCsv(p.customerName || ''),
            escapeCsv(p.paymentMethod || ''),
            itemCount,
            toAmount(p.amount).toFixed(2),
            escapeCsv(p.status || ''),
            p.paymentConfirmed ? 'Yes' : 'No',
        ].join(','));
    }
    lines.push(`TOTALS,,,,${totalItemCount},${totalRevenue.toFixed(2)},,`);

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

    const pageLeft = 40;
    const pageRight = 555;
    const tableWidth = pageRight - pageLeft;
    const rowHeight = 18;
    const detailHeaders = ['Date', 'Order #', 'Customer', 'Method', 'Items', 'Amount', 'Status', 'Confirmed'];
    const detailColWidths = [70, 70, 90, 62, 42, 66, 70, 45];
    const avgPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    let totalItems = 0;

    doc.fontSize(20).fillColor(brown).text('Sugar Cafe', { continued: true });
    doc.fillColor(dark).text(' Sales Report');
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(muted).text(`Period: ${rangeLabel.replace(/_/g, ' ')}`);
    doc.text(`Generated: ${formatCsvDate(now)}`);
    doc.moveDown(0.8);

    doc.roundedRect(pageLeft, doc.y, tableWidth, 62, 6).fillAndStroke('#FAF7F3', '#E7DED6');
    doc.fillColor(dark).fontSize(9);
    doc.text(`Total Revenue: PHP ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageLeft + 10, doc.y + 10);
    doc.text(`Total Orders: ${totalOrders}`, pageLeft + 10, doc.y + 26);
    doc.text(`Average per Order: PHP ${avgPerOrder.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageLeft + 220, doc.y + 10);
    doc.text(`Top Item Count: ${topItems.length}`, pageLeft + 220, doc.y + 26);
    doc.moveDown(4.6);

    doc.fontSize(10).fillColor(dark).text('Payment Method Summary', pageLeft, doc.y);
    doc.moveDown(0.4);
    for (const m of methodStats) {
        doc.fontSize(8.5).fillColor('#44403C').text(`- ${m.name}: ${m.count} orders (${m.value}%)`);
    }
    doc.moveDown(0.8);

    if (topItems.length > 0) {
        doc.fontSize(10).fillColor(dark).text('Top Selling Items', pageLeft, doc.y);
        doc.moveDown(0.4);
        topItems.forEach((item, idx) => {
            doc.fontSize(8.5).fillColor('#44403C').text(`${idx + 1}. ${item.name} - ${item.sold} sold`);
        });
        doc.moveDown(0.8);
    }

    const drawTableHeader = () => {
        const y = doc.y;
        doc.rect(pageLeft, y, tableWidth, rowHeight).fillAndStroke('#F5EFE8', '#E5DDD4');
        let x = pageLeft;
        doc.fontSize(7.5).fillColor('#5B4635');
        detailHeaders.forEach((header, idx) => {
            doc.text(header, x + 3, y + 5, { width: detailColWidths[idx] - 6, align: idx >= 4 ? 'right' : 'left' });
            x += detailColWidths[idx];
        });
        doc.moveDown(1.2);
    };

    doc.fontSize(10).fillColor(dark).text('Order Details', pageLeft, doc.y);
    doc.moveDown(0.5);
    drawTableHeader();

    payments.forEach((p: any, idx: number) => {
        if (doc.y > 740) {
            doc.addPage();
            drawTableHeader();
        }

        const y = doc.y;
        const bg = idx % 2 === 0 ? '#FFFFFF' : '#FCFAF8';
        doc.rect(pageLeft, y, tableWidth, rowHeight).fillAndStroke(bg, '#EEE8E2');
        const d = new Date(p.createdAt);
        const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const cart = Array.isArray(p.cart) ? p.cart : [];
        const itemCount = cart.reduce((sum: number, i: any) => sum + toQuantity(i?.quantity), 0);
        totalItems += itemCount;

        const rowValues = [
            dateStr,
            String(p.orderNumber || p._id.toString().slice(-8)),
            String(p.customerName || '').slice(0, 22),
            String(p.paymentMethod || ''),
            String(itemCount),
            `PHP ${toAmount(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            String(p.status || ''),
            p.paymentConfirmed ? 'Yes' : 'No',
        ];

        let x = pageLeft;
        doc.fontSize(7.2).fillColor('#292524');
        rowValues.forEach((value, colIdx) => {
            doc.text(value, x + 3, y + 5, { width: detailColWidths[colIdx] - 6, align: colIdx >= 4 ? 'right' : 'left' });
            x += detailColWidths[colIdx];
        });

        doc.moveDown(1.2);
    });

    if (doc.y > 740) {
        doc.addPage();
    }
    doc.moveDown(0.6);
    doc.roundedRect(pageLeft, doc.y, tableWidth, 36, 5).fillAndStroke('#FAF7F3', '#E7DED6');
    doc.fontSize(8.5).fillColor('#3F3A35');
    doc.text(`Totals - Orders: ${totalOrders}`, pageLeft + 10, doc.y + 10);
    doc.text(`Items: ${totalItems}`, pageLeft + 160, doc.y + 10);
    doc.text(
        `Revenue: PHP ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        pageLeft + 270,
        doc.y + 10
    );

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

        const csv = `\uFEFF${buildCsv(rangeLabel, now, totalRevenue, totalOrders, methodStats, topItems, payments)}`;
        const filename = `sugar_cafe_report_${rangeLabel}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to export analytics' });
    }
};

export {};
