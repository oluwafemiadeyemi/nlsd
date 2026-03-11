import { format } from "date-fns";
import type { ExpenseDay } from "./types";

export const EXPENSE_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface ExpensePeriod {
  year: number;
  month: number;
  weekNumber: string;
}

const DAY_KEY_BY_WEEKDAY: Partial<Record<number, ExpenseDay>> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export function getExpenseWeekCount(year: number, month: number): number {
  return Math.min(Math.ceil(new Date(year, month, 0).getDate() / 7), 5);
}

export function formatExpenseWeekNumber(value: number): string {
  return String(Math.min(Math.max(value, 1), 5)).padStart(2, "0");
}

export function currentExpensePeriod(now = new Date()): ExpensePeriod {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    weekNumber: formatExpenseWeekNumber(Math.ceil(now.getDate() / 7)),
  };
}

export function getExpenseWeekBlockStart(year: number, month: number, weekNumber: string | number): Date {
  const numericWeek = typeof weekNumber === "string" ? Number.parseInt(weekNumber, 10) : weekNumber;
  const safeWeek = Number.isFinite(numericWeek) ? Math.min(Math.max(numericWeek, 1), 5) : 1;
  return new Date(year, month - 1, (safeWeek - 1) * 7 + 1);
}

export function buildExpenseWeekDates(
  year: number,
  month: number,
  weekNumber: string | number
): Partial<Record<ExpenseDay, string>> {
  const numericWeek = typeof weekNumber === "string" ? Number.parseInt(weekNumber, 10) : weekNumber;
  const safeWeek = Number.isFinite(numericWeek) ? Math.min(Math.max(numericWeek, 1), 5) : 1;
  const startDay = (safeWeek - 1) * 7 + 1;
  const endDay = Math.min(startDay + 6, new Date(year, month, 0).getDate());
  const out: Partial<Record<ExpenseDay, string>> = {};

  for (let day = startDay; day <= endDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const key = DAY_KEY_BY_WEEKDAY[date.getDay()];
    if (!key) continue;
    out[key] = format(date, "MMM d");
  }

  return out;
}

export function formatExpensePeriodLabel(period: ExpensePeriod): string {
  return `Week ${Number.parseInt(period.weekNumber, 10)}, ${EXPENSE_MONTH_NAMES[period.month - 1]} ${period.year}`;
}
