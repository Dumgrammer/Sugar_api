import type { Request, Response } from 'express';

const PaymentModel = require('../models/Payment');
const InventoryModel = require('../models/Inventory');
const AdminModel = require('../models/Admin');
const {
    formatReportDateTime,
    formatReportDate,
    formatReportDateLabel,
    parseManilaDateBoundary,
    startOfDayManila,
    endOfDayManila,
    startOfWeekManila,
    startOfMonthManila,
    startOfYearManila,
    getReportTimezone,
} = require('../services/reportDateTime');
const { recordAuditLog } = require('../services/audit-log');

type ReportType = 'sales' | 'transactions' | 'inventory' | 'users';
type ExportFormat = 'csv' | 'pdf';

function toAmount(value: unknown): number {
    return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function toQuantity(value: unknown): number {
    return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function resolveRange(req: Request): { rangeStart: Date; rangeEnd: Date; rangeLabel: string; rangeDisplay: string } | null {
    const period = req.query.period as string | undefined;
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const now = new Date();

    if (fromParam && toParam) {
        const rangeStart = parseManilaDateBoundary(fromParam, false);
        const rangeEnd = parseManilaDateBoundary(toParam, true);
        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
            return null;
        }
        return {
            rangeStart,
            rangeEnd,
            rangeLabel: `${fromParam}_to_${toParam}`,
            rangeDisplay: `${formatReportDateLabel(rangeStart)} to ${formatReportDateLabel(rangeEnd)}`,
        };
    }

    if (period === 'yearly') {
        const rangeStart = startOfYearManila(now);
        const rangeEnd = endOfDayManila(now);
        const year = formatReportDate(now).slice(0, 4);
        return {
            rangeStart,
            rangeEnd,
            rangeLabel: `yearly_${year}`,
            rangeDisplay: `Year ${year}`,
        };
    }

    if (period === 'monthly') {
        const rangeStart = startOfMonthManila(now);
        const rangeEnd = endOfDayManila(now);
        const monthKey = formatReportDate(now).slice(0, 7);
        return {
            rangeStart,
            rangeEnd,
            rangeLabel: `monthly_${monthKey}`,
            rangeDisplay: `Month of ${formatReportDateLabel(rangeStart)}`,
        };
    }

    const rangeStart = startOfWeekManila(now);
    const rangeEnd = endOfDayManila(now);
    return {
        rangeStart,
        rangeEnd,
        rangeLabel: 'weekly',
        rangeDisplay: `Week of ${formatReportDateLabel(rangeStart)}`,
    };
}

function reportHeaderLines(title: string, rangeDisplay: string, now: Date): string[] {
    return [
        title,
        `Report Period,${escapeCsv(rangeDisplay)}`,
        `Generated At,${formatReportDateTime(now)}`,
        `Timezone,${getReportTimezone()}`,
        '',
    ];
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
        if (method in countMap) countMap[method] += 1;
    }
    const total = Object.values(countMap).reduce((sum, value) => sum + value, 0);
    const fallbackTotal = total > 0 ? total : 1;
    return Object.entries(countMap).map(([name, count]) => ({
        name,
        value: Math.round((count / fallbackTotal) * 100),
        count,
    }));
}

function buildSalesCsv(rangeDisplay: string, now: Date, payments: any[]): string {
    const totalRevenue = payments.reduce((sum: number, p: any) => sum + toAmount(p.amount), 0);
    const totalOrders = payments.length;
    const avgPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const methodStats = aggregatePaymentMethods(payments);
    const topItems = aggregateTopItems(payments, 15);
    const lines = reportHeaderLines('SUGAR CAFE SALES REPORT', rangeDisplay, now);

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

    lines.push('ORDER SUMMARY');
    lines.push('Date & Time,Order Number,Customer,Payment Method,Item Count,Amount (PHP),Status,Payment Confirmed');
    let totalItemCount = 0;
    for (const p of payments) {
        const cart = Array.isArray(p.cart) ? p.cart : [];
        const itemCount = cart.reduce((sum: number, i: any) => sum + toQuantity(i?.quantity), 0);
        totalItemCount += itemCount;
        lines.push([
            formatReportDateTime(new Date(p.createdAt)),
            escapeCsv(p.orderNumber || String(p._id).slice(-8)),
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

function buildTransactionsCsv(rangeDisplay: string, now: Date, payments: any[]): string {
    const lines = reportHeaderLines('SUGAR CAFE TRANSACTION REPORT', rangeDisplay, now);
    lines.push('TRANSACTION LINE ITEMS');
    lines.push('Date & Time,Order Number,Customer,Payment Method,Status,Confirmed,Item,Size,Qty,Unit Price,Line Total,Add-ons,Notes');

    for (const p of payments) {
        const cart = Array.isArray(p.cart) ? p.cart : [];
        const orderTime = formatReportDateTime(new Date(p.createdAt));
        const orderNo = p.orderNumber || String(p._id).slice(-8);

        if (!cart.length) {
            lines.push([
                orderTime,
                escapeCsv(orderNo),
                escapeCsv(p.customerName || ''),
                escapeCsv(p.paymentMethod || ''),
                escapeCsv(p.status || ''),
                p.paymentConfirmed ? 'Yes' : 'No',
                '',
                '',
                0,
                '',
                '',
                '',
                '',
            ].join(','));
            continue;
        }

        cart.forEach((item: any, index: number) => {
            const addOns = Array.isArray(item.addOns)
                ? item.addOns.map((a: any) => a?.name).filter(Boolean).join('; ')
                : '';
            lines.push([
                index === 0 ? orderTime : '',
                index === 0 ? escapeCsv(orderNo) : '',
                index === 0 ? escapeCsv(p.customerName || '') : '',
                index === 0 ? escapeCsv(p.paymentMethod || '') : '',
                index === 0 ? escapeCsv(p.status || '') : '',
                index === 0 ? (p.paymentConfirmed ? 'Yes' : 'No') : '',
                escapeCsv(String(item.name || '')),
                escapeCsv(String(item.size || '')),
                toQuantity(item.quantity),
                toAmount(item.price).toFixed(2),
                toAmount(item.lineTotal ?? item.price * toQuantity(item.quantity)).toFixed(2),
                escapeCsv(addOns),
                escapeCsv(String(item.notes || '')),
            ].join(','));
        });
    }

    return lines.join('\n');
}

function buildInventoryCsv(now: Date, inventories: any[]): string {
    const lines = reportHeaderLines('SUGAR CAFE INVENTORY REPORT', 'Current snapshot', now);
    let totalValue = 0;
    let lowStock = 0;
    let outOfStock = 0;

    lines.push('INVENTORY DETAILS');
    lines.push('SKU,Item Name,Category,Unit,Stock Qty,Reorder Level,Unit Cost,Stock Value,Status,Last Updated');

    for (const item of inventories) {
        const stock = toAmount(item.stockQuantity);
        const reorder = toAmount(item.reorderLevel);
        const cost = toAmount(item.unitCost);
        const value = stock * cost;
        totalValue += value;
        const status = stock === 0 ? 'Out of Stock' : stock <= reorder ? 'Low Stock' : 'Healthy';
        if (status === 'Out of Stock') outOfStock += 1;
        if (status === 'Low Stock') lowStock += 1;

        lines.push([
            escapeCsv(String(item.skuCode ?? '')),
            escapeCsv(String(item.itemName ?? '')),
            escapeCsv(String(item.category ?? '')),
            escapeCsv(String(item.unit ?? '')),
            stock,
            reorder,
            cost.toFixed(2),
            value.toFixed(2),
            status,
            item.updatedAt ? formatReportDateTime(new Date(item.updatedAt)) : '',
        ].join(','));
    }

    lines.push('');
    lines.push('INVENTORY SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Total SKUs,${inventories.length}`);
    lines.push(`Low Stock Items,${lowStock}`);
    lines.push(`Out of Stock Items,${outOfStock}`);
    lines.push(`Total Inventory Value,${totalValue.toFixed(2)}`);

    return lines.join('\n');
}

function buildUsersCsv(now: Date, admins: any[]): string {
    const lines = reportHeaderLines('SUGAR CAFE USER REPORT', 'All registered admins', now);
    lines.push('ADMIN USERS');
    lines.push('Full Name,Email,Created At,Updated At');

    for (const admin of admins) {
        const fullName = [admin.f_name, admin.m_name, admin.l_name]
            .map((part: string) => String(part ?? '').trim())
            .filter(Boolean)
            .join(' ');
        lines.push([
            escapeCsv(fullName),
            escapeCsv(String(admin.email ?? '')),
            admin.createdAt ? formatReportDateTime(new Date(admin.createdAt)) : '',
            admin.updatedAt ? formatReportDateTime(new Date(admin.updatedAt)) : '',
        ].join(','));
    }

    lines.push('');
    lines.push('SUMMARY');
    lines.push(`Total Admins,${admins.length}`);

    return lines.join('\n');
}

function buildSimplePdf(title: string, rangeDisplay: string, now: Date, sections: Array<{ heading: string; lines: string[] }>): any {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const brown = '#78553B';
    const dark = '#1C1917';
    const muted = '#A8A29E';

    doc.fontSize(18).fillColor(brown).text('Sugar Cafe', { continued: true });
    doc.fillColor(dark).text(` ${title}`);
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(muted);
    doc.text(`Period: ${rangeDisplay}`);
    doc.text(`Generated: ${formatReportDateTime(now)} (${getReportTimezone()})`);
    doc.moveDown(0.8);

    for (const section of sections) {
        if (doc.y > 700) doc.addPage();
        doc.fontSize(11).fillColor(dark).text(section.heading);
        doc.moveDown(0.3);
        doc.fontSize(8.5).fillColor('#44403C');
        for (const line of section.lines) {
            if (doc.y > 740) doc.addPage();
            doc.text(line);
        }
        doc.moveDown(0.6);
    }

    doc.end();
    return doc;
}

exports.exportReport = async (req: Request, res: Response) => {
    try {
        const reportType = (req.query.type as ReportType) || 'sales';
        const format = (req.query.format as ExportFormat) === 'pdf' ? 'pdf' : 'csv';
        const now = new Date();

        await recordAuditLog({
            req,
            category: 'report',
            action: 'report_exported',
            summary: `Exported ${reportType} report (${format.toUpperCase()})`,
            details: {
                reportType,
                format,
                period: req.query.period,
                from: req.query.from,
                to: req.query.to,
            },
        });

        if (reportType === 'inventory') {
            const inventories = await InventoryModel.find().sort({ category: 1, itemName: 1 });
            const csv = `\uFEFF${buildInventoryCsv(now, inventories)}`;
            const filename = `inventory_report_${formatReportDate(now)}.${format}`;
            if (format === 'pdf') {
                const low = inventories.filter((i: any) => i.stockQuantity > 0 && i.stockQuantity <= i.reorderLevel).length;
                const out = inventories.filter((i: any) => i.stockQuantity === 0).length;
                const pdf = buildSimplePdf('Inventory Report', 'Current snapshot', now, [
                    {
                        heading: 'Summary',
                        lines: [
                            `Total SKUs: ${inventories.length}`,
                            `Low stock: ${low}`,
                            `Out of stock: ${out}`,
                        ],
                    },
                    {
                        heading: 'Items (first 80)',
                        lines: inventories.slice(0, 80).map((item: any) => {
                            const status = item.stockQuantity === 0 ? 'OUT' : item.stockQuantity <= item.reorderLevel ? 'LOW' : 'OK';
                            return `${item.skuCode} | ${item.itemName} | ${item.stockQuantity} ${item.unit} | ${status}`;
                        }),
                    },
                ]);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                pdf.pipe(res);
                return;
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csv);
        }

        if (reportType === 'users') {
            const admins = await AdminModel.find({}, 'f_name m_name l_name email createdAt updatedAt').sort({ l_name: 1, f_name: 1 });
            const csv = `\uFEFF${buildUsersCsv(now, admins)}`;
            const filename = `users_report_${formatReportDate(now)}.${format}`;
            if (format === 'pdf') {
                const pdf = buildSimplePdf('User Report', 'All registered admins', now, [
                    {
                        heading: 'Admin roster',
                        lines: admins.map((admin: any) => {
                            const fullName = [admin.f_name, admin.m_name, admin.l_name].filter(Boolean).join(' ');
                            return `${fullName} <${admin.email}>`;
                        }),
                    },
                ]);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                pdf.pipe(res);
                return;
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csv);
        }

        const resolved = resolveRange(req);
        if (!resolved) {
            return res.status(400).json({ message: 'Invalid date range. Use YYYY-MM-DD format.' });
        }

        const { rangeStart, rangeEnd, rangeLabel, rangeDisplay } = resolved;
        const payments = await PaymentModel.find({ createdAt: { $gte: rangeStart, $lte: rangeEnd } }).sort({ createdAt: 1 });
        const filename = `${reportType}_report_${rangeLabel}.${format}`;

        if (reportType === 'transactions') {
            const csv = `\uFEFF${buildTransactionsCsv(rangeDisplay, now, payments)}`;
            if (format === 'pdf') {
                const pdf = buildSimplePdf('Transaction Report', rangeDisplay, now, [
                    {
                        heading: 'Orders',
                        lines: payments.slice(0, 100).map((p: any) =>
                            `${formatReportDateTime(new Date(p.createdAt))} | ${p.orderNumber || String(p._id).slice(-8)} | ${p.customerName} | PHP ${toAmount(p.amount).toFixed(2)}`
                        ),
                    },
                ]);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                pdf.pipe(res);
                return;
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csv);
        }

        // sales (default)
        const { buildPdf } = require('./Analytics');
        if (format === 'pdf' && typeof buildPdf === 'function') {
            const totalRevenue = payments.reduce((sum: number, p: any) => sum + toAmount(p.amount), 0);
            const totalOrders = payments.length;
            const topItems = aggregateTopItems(payments, 10);
            const methodStats = aggregatePaymentMethods(payments);
            const pdfDoc = buildPdf(
                rangeDisplay,
                now,
                totalRevenue,
                totalOrders,
                methodStats,
                topItems,
                payments
            );
            if (pdfDoc) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                pdfDoc.pipe(res);
                return;
            }
        }

        const csv = `\uFEFF${buildSalesCsv(rangeDisplay, now, payments)}`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to export report' });
    }
};

export {};
