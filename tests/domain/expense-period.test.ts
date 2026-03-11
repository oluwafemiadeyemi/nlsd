import { describe, expect, it } from "vitest";
import {
  buildExpenseWeekDates,
  currentExpensePeriod,
  formatExpensePeriodLabel,
  getExpenseWeekCount,
} from "@/domain/expenses/period";

describe("expense period helpers", () => {
  it("uses month-based week numbers for the current period", () => {
    const period = currentExpensePeriod(new Date(2026, 2, 19));
    expect(period).toEqual({ year: 2026, month: 3, weekNumber: "03" });
  });

  it("returns four weeks for a 28-day month", () => {
    expect(getExpenseWeekCount(2026, 2)).toBe(4);
  });

  it("maps a month week to the actual Mon-Sat dates inside that 7-day block", () => {
    const dates = buildExpenseWeekDates(2026, 3, "01");
    expect(dates).toEqual({
      mon: "Mar 2",
      tue: "Mar 3",
      wed: "Mar 4",
      thu: "Mar 5",
      fri: "Mar 6",
      sat: "Mar 7",
    });
  });

  it("formats labels with month context", () => {
    expect(formatExpensePeriodLabel({ year: 2026, month: 3, weekNumber: "05" })).toBe("Week 5, March 2026");
  });
});
