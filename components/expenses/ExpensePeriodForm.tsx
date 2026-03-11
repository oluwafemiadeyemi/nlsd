"use client";

import { useEffect, useState } from "react";
import {
  EXPENSE_MONTH_NAMES,
  formatExpenseWeekNumber,
  getExpenseWeekCount,
} from "@/domain/expenses/period";

const EXPENSE_YEAR_OPTIONS = Array.from({ length: 101 }, (_, index) => 2000 + index);

interface ExpensePeriodFormProps {
  defaultYear: number;
  defaultMonth: number;
  defaultWeekNumber: string;
}

export function ExpensePeriodForm({
  defaultYear,
  defaultMonth,
  defaultWeekNumber,
}: ExpensePeriodFormProps) {
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [weekNumber, setWeekNumber] = useState(defaultWeekNumber);

  const weekCount = getExpenseWeekCount(year, month);

  useEffect(() => {
    const maxWeek = formatExpenseWeekNumber(weekCount);
    if (Number.parseInt(weekNumber, 10) > weekCount) {
      setWeekNumber(maxWeek);
    }
  }, [weekCount, weekNumber]);

  return (
    <form action="/expenses/new" className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px]">
          <label htmlFor="expense-month" className="mb-1 block text-xs font-medium text-muted-foreground">
            Month
          </label>
          <select
            id="expense-month"
            name="month"
            value={String(month)}
            onChange={(event) => setMonth(Number.parseInt(event.target.value, 10))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {EXPENSE_MONTH_NAMES.map((monthName, index) => (
              <option key={monthName} value={index + 1}>
                {monthName}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[120px]">
          <label htmlFor="expense-year" className="mb-1 block text-xs font-medium text-muted-foreground">
            Year
          </label>
          <select
            id="expense-year"
            name="year"
            value={String(year)}
            onChange={(event) => setYear(Number.parseInt(event.target.value, 10))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {EXPENSE_YEAR_OPTIONS.map((optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[120px]">
          <label htmlFor="expense-week" className="mb-1 block text-xs font-medium text-muted-foreground">
            Week
          </label>
          <select
            id="expense-week"
            name="week"
            value={weekNumber}
            onChange={(event) => setWeekNumber(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {Array.from({ length: weekCount }, (_, index) => {
              const value = formatExpenseWeekNumber(index + 1);
              return (
                <option key={value} value={value}>
                  Week {index + 1}
                </option>
              );
            })}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Create Claim
        </button>
      </div>
    </form>
  );
}
