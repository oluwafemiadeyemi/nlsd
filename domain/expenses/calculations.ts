import type {
  ExpenseDay,
  ExpenseDayEntry,
  ExpenseDayTotal,
  ExpenseWeeklyTotals,
} from "./types";
import { EXPENSE_DAYS } from "./types";

/**
 * Calculates totals for a single expense day.
 *
 * suggestedMileageCost = mileageKm * ratePerKm  (display only)
 * dailyTotal = mileageCostClaimed + lodging + (breakfast + lunch + dinner) + other
 */
export function calcExpenseDayTotal(
  entry: ExpenseDayEntry,
  ratePerKm: number
): ExpenseDayTotal {
  const suggestedMileageCost = safe(entry.mileageKm) * ratePerKm;
  const totalMeals =
    safe(entry.breakfast) + safe(entry.lunch) + safe(entry.dinner);
  const dailyTotal =
    safe(entry.mileageCostClaimed) +
    safe(entry.lodging) +
    totalMeals +
    safe(entry.other);

  return { suggestedMileageCost, dailyTotal, totalMeals };
}

/**
 * Calculates all weekly totals for an expense week.
 *
 * totalMileageKm = sum(mileageKm)
 * totalMileageCostClaimed = sum(mileageCostClaimed)
 * mileageCostAtRate = totalMileageKm * ratePerKm  (display only)
 * totalLodging = sum(lodging)
 * totalMeals = sum(breakfast + lunch + dinner)
 * totalOther = sum(other)
 * weeklyTotal = totalMileageCostClaimed + totalLodging + totalMeals + totalOther
 */
export function calcExpenseWeeklyTotals(
  days: Record<ExpenseDay, ExpenseDayEntry>,
  ratePerKm: number
): ExpenseWeeklyTotals {
  let totalMileageKm = 0;
  let totalMileageCostClaimed = 0;
  let totalLodging = 0;
  let totalMeals = 0;
  let totalOther = 0;

  const dayTotals = {} as Record<ExpenseDay, ExpenseDayTotal>;

  for (const day of EXPENSE_DAYS) {
    const entry = days[day];
    const dt = calcExpenseDayTotal(entry, ratePerKm);
    dayTotals[day] = dt;

    totalMileageKm += safe(entry.mileageKm);
    totalMileageCostClaimed += safe(entry.mileageCostClaimed);
    totalLodging += safe(entry.lodging);
    totalMeals += dt.totalMeals;
    totalOther += safe(entry.other);
  }

  const mileageCostAtRate = totalMileageKm * ratePerKm;
  const weeklyTotal =
    totalMileageCostClaimed + totalLodging + totalMeals + totalOther;

  return {
    totalMileageKm,
    totalMileageCostClaimed,
    mileageCostAtRate,
    totalLodging,
    totalMeals,
    totalOther,
    weeklyTotal,
    dayTotals,
  };
}

/**
 * Returns an empty expense day entry.
 */
export function emptyExpenseDayEntry(): ExpenseDayEntry {
  return {
    mileageKm: 0,
    mileageCostClaimed: 0,
    lodging: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    other: 0,
    notes: "",
  };
}

/**
 * Returns a full empty days map for a new expense week.
 */
export function emptyExpenseDaysMap(): Record<ExpenseDay, ExpenseDayEntry> {
  return Object.fromEntries(
    EXPENSE_DAYS.map((d) => [d, emptyExpenseDayEntry()])
  ) as Record<ExpenseDay, ExpenseDayEntry>;
}

/**
 * Formats a currency value to a display string.
 */
export function formatCurrency(value: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function safe(v: number | null | undefined): number {
  if (typeof v !== "number" || isNaN(v)) return 0;
  return Math.max(0, v);
}
