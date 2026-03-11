import { describe, expect, it } from "vitest";
import {
  buildMonthDayEntriesFromTimesheets,
  buildTimesheetRowsFromEntries,
  buildWeekDraftPayload,
  dayColumnForDate,
  emptyTimesheetDayEntry,
  getTimesheetWeekCount,
  weekHasAnyDraftData,
} from "@/domain/timesheets/editor";

describe("timesheet editor helpers", () => {
  it("uses month blocks of four or five weeks", () => {
    expect(getTimesheetWeekCount(2026, 2)).toBe(4);
    expect(getTimesheetWeekCount(2026, 3)).toBe(5);
  });

  it("maps calendar dates to weekday columns", () => {
    expect(dayColumnForDate(2026, 3, 1)).toBe("sun");
    expect(dayColumnForDate(2026, 3, 7)).toBe("sat");
  });

  it("detects draft data inside a selected week", () => {
    const dayEntries = {
      9: [{ ...emptyTimesheetDayEntry(), hours: "8" }],
    };

    expect(weekHasAnyDraftData(dayEntries, 2026, 3, 2)).toBe(true);
    expect(weekHasAnyDraftData(dayEntries, 2026, 3, 3)).toBe(false);
  });

  it("stores only populated days in the weekly payload", () => {
    const dayEntries = {
      8: [{ ...emptyTimesheetDayEntry(), billingTypeId: "bt-1", projectId: "p-1", hours: "8" }],
      9: [{ ...emptyTimesheetDayEntry() }],
    };

    expect(buildWeekDraftPayload(dayEntries, 2026, 3, 2)).toEqual({
      dayEntries: {
        "8": [{ billingTypeId: "bt-1", projectId: "p-1", hours: "8", mileage: "", meals: "", lodging: "", other: "" }],
      },
    });
  });

  it("serializes visible day pills into weekly timesheet rows", () => {
    const rows = buildTimesheetRowsFromEntries({
      timesheetId: "ts-1",
      dayEntries: {
        8: [{ billingTypeId: "bt-1", projectId: "p-1", hours: "8", mileage: "", meals: "", lodging: "", other: "" }],
      },
      year: 2026,
      month: 3,
      week: 2,
      projectLabelById: { "p-1": "Beauval" },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      timesheet_id: "ts-1",
      billing_type_id: "bt-1",
      project_id: "p-1",
      sun: 8,
      sun_location: "Beauval",
    });
  });

  it("prefers stored draft payloads when rebuilding month day entries", () => {
    const result = buildMonthDayEntriesFromTimesheets({
      year: 2026,
      month: 3,
      timesheets: [
        {
          week_number: 2,
          draft_payload: {
            dayEntries: {
              "8": [{ billingTypeId: "bt-1", projectId: "p-1", hours: "8", mileage: "10", meals: "", lodging: "", other: "" }],
            },
          },
          timesheet_rows: [],
        },
      ],
    });

    expect(result[8]?.[0]).toEqual({
      billingTypeId: "bt-1",
      projectId: "p-1",
      hours: "8",
      mileage: "10",
      meals: "",
      lodging: "",
      other: "",
    });
  });
});
