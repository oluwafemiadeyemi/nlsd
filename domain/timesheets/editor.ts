export const TIMESHEET_BILLING_TYPE_NAMES = [
  "Regular Time 1",
  "Regular Time 2",
  "Regular Time 3",
  "Regular Time 4",
  "Start Holiday",
  "Vacation",
  "Earned Day Off",
  "Sick",
  "Compassionate",
  "Leave Without Pay",
] as const;

export const TIMESHEET_LOCATION_TITLES = [
  "Beauval",
  "Brabant Lake",
  "Buffalo Narrows",
  "Cole Bay",
  "Cumberland House",
  "Green Lake",
  "Jans Bay",
  "La Loche",
  "La Ronge/Air Ronge",
  "Pinehouse",
  "Sandy Bay",
  "St George's Hill",
  "Stony Rapids",
  "Timber Bay",
  "Uranium City",
  "Weyakwin",
] as const;

export const TIMESHEET_DAY_COLUMNS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

export type TimesheetDayColumn = (typeof TIMESHEET_DAY_COLUMNS)[number];

export interface TimesheetLookupOption {
  id: string;
  label: string;
  code?: string | null;
}

export interface TimesheetDayEntry {
  billingTypeId: string;
  projectId: string;
  hours: string;
  mileageKm: string;
  mileage: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  lodging: string;
  other: string;
  /** @deprecated kept for backwards compat with old draft_payload; use breakfast+lunch+dinner */
  meals?: string;
}

export interface TimesheetDraftPayload {
  dayEntries: Record<string, TimesheetDayEntry[]>;
}

export interface PersistedTimesheetRow {
  id?: string;
  timesheet_id?: string;
  billing_type_id: string;
  project_id: string | null;
  sun: number;
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun_location?: string | null;
  mon_location?: string | null;
  tue_location?: string | null;
  wed_location?: string | null;
  thu_location?: string | null;
  fri_location?: string | null;
  sat_location?: string | null;
  billing_type?: { name?: string | null } | null;
  project?: { code?: string | null; title?: string | null } | null;
}

export interface PersistedWeekTimesheet {
  week_number: number;
  draft_payload?: unknown;
  timesheet_rows?: PersistedTimesheetRow[] | null;
}

export function emptyTimesheetDayEntry(): TimesheetDayEntry {
  return {
    billingTypeId: "",
    projectId: "",
    hours: "",
    mileageKm: "",
    mileage: "",
    breakfast: "",
    lunch: "",
    dinner: "",
    lodging: "",
    other: "",
  };
}

export function getTimesheetWeekCount(year: number, month: number): number {
  return Math.min(Math.ceil(new Date(year, month, 0).getDate() / 7), 5);
}

export function getTimesheetWeekDayNumbers(year: number, month: number, week: number): number[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDay = (week - 1) * 7 + 1;
  const endDay = Math.min(week * 7, daysInMonth);
  return Array.from({ length: Math.max(0, endDay - startDay + 1) }, (_, index) => startDay + index);
}

export function dayColumnForDate(year: number, month: number, day: number): TimesheetDayColumn {
  return TIMESHEET_DAY_COLUMNS[new Date(year, month - 1, day).getDay()];
}

export function hasAnyTimesheetEntryValue(entry: TimesheetDayEntry): boolean {
  return (
    entry.billingTypeId.trim().length > 0 ||
    entry.projectId.trim().length > 0 ||
    entry.hours.trim().length > 0 ||
    entry.mileageKm.trim().length > 0 ||
    entry.mileage.trim().length > 0 ||
    entry.breakfast.trim().length > 0 ||
    entry.lunch.trim().length > 0 ||
    entry.dinner.trim().length > 0 ||
    entry.lodging.trim().length > 0 ||
    entry.other.trim().length > 0
  );
}

export function weekHasAnyDraftData(
  dayEntries: Record<number, TimesheetDayEntry[]>,
  year: number,
  month: number,
  week: number
): boolean {
  return getTimesheetWeekDayNumbers(year, month, week).some((day) =>
    (dayEntries[day] ?? []).some(hasAnyTimesheetEntryValue)
  );
}

export function buildWeekDraftPayload(
  dayEntries: Record<number, TimesheetDayEntry[]>,
  year: number,
  month: number,
  week: number
): TimesheetDraftPayload | null {
  const payloadEntries: Record<string, TimesheetDayEntry[]> = {};

  for (const day of getTimesheetWeekDayNumbers(year, month, week)) {
    const entries = (dayEntries[day] ?? []).filter(hasAnyTimesheetEntryValue);
    if (entries.length > 0) {
      payloadEntries[String(day)] = entries.map((entry) => ({ ...entry }));
    }
  }

  return Object.keys(payloadEntries).length > 0 ? { dayEntries: payloadEntries } : null;
}

export function buildTimesheetRowsFromEntries(args: {
  timesheetId: string;
  dayEntries: Record<number, TimesheetDayEntry[]>;
  year: number;
  month: number;
  week: number;
  projectLabelById: Record<string, string>;
}): PersistedTimesheetRow[] {
  const rows: PersistedTimesheetRow[] = [];

  for (const day of getTimesheetWeekDayNumbers(args.year, args.month, args.week)) {
    const column = dayColumnForDate(args.year, args.month, day);
    for (const entry of args.dayEntries[day] ?? []) {
      const hours = parseFloat(entry.hours || "0");
      if (!entry.billingTypeId || !entry.projectId || !Number.isFinite(hours) || hours <= 0) {
        continue;
      }

      const row: PersistedTimesheetRow = {
        timesheet_id: args.timesheetId,
        billing_type_id: entry.billingTypeId,
        project_id: entry.projectId,
        sun: 0,
        mon: 0,
        tue: 0,
        wed: 0,
        thu: 0,
        fri: 0,
        sat: 0,
        sun_location: null,
        mon_location: null,
        tue_location: null,
        wed_location: null,
        thu_location: null,
        fri_location: null,
        sat_location: null,
      } as PersistedTimesheetRow;

      (row as any)[column] = hours;
      (row as any)[`${column}_location`] =
        args.projectLabelById[entry.projectId] ?? null;

      rows.push(row);
    }
  }

  return rows;
}

export function buildMonthDayEntriesFromTimesheets(args: {
  timesheets: PersistedWeekTimesheet[];
  year: number;
  month: number;
}): Record<number, TimesheetDayEntry[]> {
  const next: Record<number, TimesheetDayEntry[]> = {};

  for (const timesheet of args.timesheets) {
    if (timesheet.week_number <= 0) continue;

    const fromPayload = coerceDraftPayload(timesheet.draft_payload);
    if (Object.keys(fromPayload).length > 0) {
      for (const [day, entries] of Object.entries(fromPayload)) {
        next[Number(day)] = entries;
      }
      continue;
    }

    for (const row of timesheet.timesheet_rows ?? []) {
      for (const day of getTimesheetWeekDayNumbers(args.year, args.month, timesheet.week_number)) {
        const column = dayColumnForDate(args.year, args.month, day);
        const rawHours = row[column];
        const hours = typeof rawHours === "number" ? rawHours : Number(rawHours ?? 0);
        if (!hours) continue;

        const entry: TimesheetDayEntry = {
          billingTypeId: row.billing_type_id ?? "",
          projectId: row.project_id ?? "",
          hours: formatNumericInput(hours),
          mileageKm: "",
          mileage: "",
          breakfast: "",
          lunch: "",
          dinner: "",
          lodging: "",
          other: "",
        };

        if (!next[day]) next[day] = [];
        next[day].push(entry);
      }
    }
  }

  return next;
}

function coerceDraftPayload(raw: unknown): Record<number, TimesheetDayEntry[]> {
  if (!raw || typeof raw !== "object") return {};

  const source =
    "dayEntries" in raw && raw.dayEntries && typeof raw.dayEntries === "object"
      ? (raw.dayEntries as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  const out: Record<number, TimesheetDayEntry[]> = {};
  for (const [day, value] of Object.entries(source)) {
    const numericDay = Number(day);
    if (!Number.isInteger(numericDay) || !Array.isArray(value)) continue;

    const entries = value
      .map((candidate) => coerceDayEntry(candidate))
      .filter((entry): entry is TimesheetDayEntry => entry !== null);

    if (entries.length > 0) {
      out[numericDay] = entries;
    }
  }

  return out;
}

function coerceDayEntry(value: unknown): TimesheetDayEntry | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  let breakfast = readString(candidate.breakfast);
  let lunch = readString(candidate.lunch);
  let dinner = readString(candidate.dinner);

  // Backwards compat: old drafts stored aggregate "meals" instead of B/L/D
  if (!breakfast && !lunch && !dinner) {
    const legacyMeals = readString(candidate.meals);
    if (legacyMeals) dinner = legacyMeals;
  }

  return {
    billingTypeId: readString(candidate.billingTypeId),
    projectId: readString(candidate.projectId),
    hours: readString(candidate.hours),
    mileageKm: readString(candidate.mileageKm),
    mileage: readString(candidate.mileage),
    breakfast,
    lunch,
    dinner,
    lodging: readString(candidate.lodging),
    other: readString(candidate.other),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatNumericInput(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}
