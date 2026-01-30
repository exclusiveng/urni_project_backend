import { Attendance } from "../entities/Attendance";

/**
 * Check if a date is a weekend (Saturday = 6, Sunday = 0)
 */
export const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
};

/**
 * Filter out weekend attendance records unless they are marked as weekend work
 */
export const filterWeekendAttendance = (records: Attendance[]): Attendance[] => {
    return records.filter(record => {
        const clockInDate = new Date(record.clock_in_time);
        // Include the record if:
        // 1. It's NOT a weekend, OR
        // 2. It IS a weekend AND explicitly marked as weekend work
        return !isWeekend(clockInDate) || record.is_weekend_work;
    });
};

/**
 * Count business days (excluding weekends) in a date range
 */
export const countBusinessDays = (startDate: Date, endDate: Date): number => {
    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
        if (!isWeekend(current)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return count;
};

/**
 * Get WHERE clause for filtering weekends at database level (PostgreSQL)
 * Returns SQL condition: (day_of_week NOT IN (0,6) OR is_weekend_work = true)
 * This is more efficient than in-memory filtering for large datasets
 */
export const getWeekendFilterWhereClause = (): string => {
    return "(EXTRACT(DOW FROM clock_in_time) NOT IN (0, 6) OR is_weekend_work = true)";
};
