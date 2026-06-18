const REPORT_TIMEZONE = 'Asia/Manila';

export function formatReportDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: REPORT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
}

export function formatReportDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: REPORT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

export function formatReportTime(date: Date): string {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: REPORT_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
}

export function formatReportDateLabel(date: Date): string {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: REPORT_TIMEZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
}

/** Parse YYYY-MM-DD as start/end of day in Asia/Manila */
export function parseManilaDateBoundary(dateStr: string, endOfDay = false): Date {
    const time = endOfDay ? 'T23:59:59.999+08:00' : 'T00:00:00.000+08:00';
    return new Date(`${dateStr}${time}`);
}

export function startOfDayManila(date: Date): Date {
    const key = formatReportDate(date);
    return parseManilaDateBoundary(key, false);
}

export function endOfDayManila(date: Date): Date {
    const key = formatReportDate(date);
    return parseManilaDateBoundary(key, true);
}

export function startOfWeekManila(date: Date): Date {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    }).formatToParts(date);

    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    const diff = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
    const anchor = new Date(Date.UTC(year, month - 1, day));
    anchor.setUTCDate(anchor.getUTCDate() + diff);
    const key = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}-${String(anchor.getUTCDate()).padStart(2, '0')}`;
    return parseManilaDateBoundary(key, false);
}

export function startOfMonthManila(date: Date): Date {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    return parseManilaDateBoundary(`${year}-${month}-01`, false);
}

export function startOfYearManila(date: Date): Date {
    const year = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIMEZONE,
        year: 'numeric',
    }).format(date);
    return parseManilaDateBoundary(`${year}-01-01`, false);
}

export function getManilaHour(date: Date): number {
    const hour = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIMEZONE,
        hour: '2-digit',
        hour12: false,
    }).format(date);
    return Number(hour);
}

export function getManilaWeekdayIndex(date: Date): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIMEZONE,
        weekday: 'short',
    }).format(date);
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    return index === -1 ? 0 : index;
}

export function getManilaDayOfMonth(date: Date): number {
    return Number(
        new Intl.DateTimeFormat('en-US', {
            timeZone: REPORT_TIMEZONE,
            day: 'numeric',
        }).format(date)
    );
}

export function getReportTimezone(): string {
    return REPORT_TIMEZONE;
}

module.exports = {
    REPORT_TIMEZONE,
    formatReportDateTime,
    formatReportDate,
    formatReportTime,
    formatReportDateLabel,
    parseManilaDateBoundary,
    startOfDayManila,
    endOfDayManila,
    startOfWeekManila,
    startOfMonthManila,
    startOfYearManila,
    getManilaHour,
    getManilaWeekdayIndex,
    getManilaDayOfMonth,
    getReportTimezone,
};

export {};
