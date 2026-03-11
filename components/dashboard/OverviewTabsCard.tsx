"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  TIMESHEET_BILLING_TYPE_NAMES,
  TIMESHEET_LOCATION_TITLES,
  buildMonthDayEntriesFromTimesheets,
  buildTimesheetRowsFromEntries,
  buildWeekDraftPayload,
  emptyTimesheetDayEntry,
  getTimesheetWeekCount,
  getTimesheetWeekDayNumbers,
  hasAnyTimesheetEntryValue,
  type TimesheetDayEntry,
  type TimesheetLookupOption,
  type PersistedTimesheetRow,
} from "@/domain/timesheets/editor";


const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const TIMESHEET_YEAR_OPTIONS = Array.from({ length: 101 }, (_, index) => 2000 + index);

const TABS = ["Timesheets"] as const;
type Tab = typeof TABS[number];



interface TsRow {
  id: string;
  week_number: number;
  status: string;
  month?: number;
  year?: number;
  employee_notes?: string | null;
  manager_comments?: string | null;
  manager_id?: string | null;
  draft_payload?: unknown;
  timesheet_rows?: PersistedTimesheetRow[] | null;
}

interface ExRow {
  id: string;
  week_number: string | number;
  year: number;
  month?: number;
  status: string;
}

interface ManagerOption {
  id: string;
  display_name: string;
}

interface Props {
  year: number;
  month: number;
  week: number;
  realTimesheets: TsRow[];
  realExpenses: ExRow[];
  newExHref: string;
  userRole?: "employee" | "manager" | "admin" | "finance";
  userId?: string;
  managers?: ManagerOption[];
  defaultManagerId?: string;
}

function ManagerCombobox({ managers, value, onChange }: { managers: ManagerOption[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = managers.find((m) => m.id === value);
  const filtered = useMemo(() => {
    if (!query) return managers;
    const q = query.toLowerCase();
    return managers.filter((m) => m.display_name.toLowerCase().includes(q));
  }, [managers, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Show first 50 results to avoid rendering thousands at once
  const visible = filtered.slice(0, 50);

  return (
    <div className="flex items-center gap-1.5" ref={ref}>
      <span className="text-sm font-bold text-gray-800">Manager</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={managers.length > 0 ? "Search by name…" : "No employees synced"}
          disabled={managers.length === 0}
          value={open ? query : (selected?.display_name ?? "")}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(""); }}
          className="rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-1.5 text-sm text-gray-700 min-w-[200px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setQuery(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            title="Clear"
          >
            ✕
          </button>
        )}
        {open && managers.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
            ) : (
              <>
                {visible.map((m) => (
                  <li
                    key={m.id}
                    onClick={() => { onChange(m.id); setQuery(""); setOpen(false); }}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 ${m.id === value ? "bg-primary/5 font-medium text-primary" : "text-gray-700"}`}
                  >
                    {m.display_name}
                  </li>
                ))}
                {filtered.length > 50 && (
                  <li className="px-3 py-1.5 text-xs text-gray-400 text-center">Type to narrow {filtered.length} results…</li>
                )}
              </>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}


export function OverviewTabsCard({ year, month, week, realTimesheets, realExpenses, newExHref, userRole = "employee", userId, managers = [], defaultManagerId = "" }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Timesheets");
  const [activeWeek, setActiveWeek] = useState<number>(week);
  const [selectedMonth, setSelectedMonth] = useState<number>(month);
  const [selectedYear, setSelectedYear] = useState<number>(year);
  const [selectedManager, setSelectedManager] = useState<string>(defaultManagerId);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => {
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() + 1 === month) return now.getDate();
    return null;
  });
  const [dayEntries, setDayEntries] = useState<Record<number, TimesheetDayEntry[]>>({});
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const [editingBilling, setEditingBilling] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [billingOptions, setBillingOptions] = useState<TimesheetLookupOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<TimesheetLookupOption[]>([]);
  const [monthNotes, setMonthNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodReady, setPeriodReady] = useState(false);
  const [dbSupportsMonth, setDbSupportsMonth] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [localTimesheets, setLocalTimesheets] = useState<TsRow[]>(realTimesheets);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // Note: this component always shows the current user's OWN timesheets.
  // Approval of other employees' timesheets happens via /approvals/[id].
  const loadedSnapshotRef = useRef("");

  // Sync localTimesheets when server data changes
  useEffect(() => { setLocalTimesheets(realTimesheets); }, [realTimesheets]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [billingResult, locationResult]: any[] = await Promise.all([
        (supabase.from as any)("billing_types")
          .select("id, name")
          .in("name", [...TIMESHEET_BILLING_TYPE_NAMES]),
        (supabase.from as any)("projects")
          .select("id, code, title")
          .in("title", [...TIMESHEET_LOCATION_TITLES]),
      ]);

      if (cancelled) return;

      const billingByName = new Map((billingResult.data ?? []).map((item: any) => [item.name, item]));
      const locationByTitle = new Map((locationResult.data ?? []).map((item: any) => [item.title, item]));

      setBillingOptions(
        TIMESHEET_BILLING_TYPE_NAMES
          .map((name) => billingByName.get(name))
          .filter(Boolean)
          .map((item: any) => ({ id: item.id, label: item.name }))
      );
      setLocationOptions(
        TIMESHEET_LOCATION_TITLES
          .map((title) => locationByTitle.get(title))
          .filter(Boolean)
          .map((item: any) => ({ id: item.id, label: item.title, code: item.code }))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Auto-save entries — always writes to the ref key (the month the data belongs to)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setPeriodLoading(true);
    setPeriodReady(false);

    (async () => {
      // Try with month column first; fall back to year-only if column doesn't exist yet
      let data: any[] | null = null;
      let error: any = null;

      const selectCols = `
        id, year, month, week_number, status, employee_notes, manager_comments, manager_id, draft_payload,
        timesheet_rows(
          id, timesheet_id, billing_type_id, project_id, sun, mon, tue, wed, thu, fri, sat, weekly_total,
          sun_location, mon_location, tue_location, wed_location, thu_location, fri_location, sat_location,
          billing_type:billing_types(name),
          project:projects(code, title)
        )
      `;

      const result: any = await (supabase.from as any)("timesheets")
        .select(selectCols)
        .eq("employee_id", userId)
        .eq("year", selectedYear)
        .eq("month", selectedMonth)
        .order("week_number");

      if (result.error) {
        // Fallback: month/draft_payload columns may not exist yet (migration 021 pending).
        // Disable DB draft persistence until migration is applied.
        if (!cancelled) setDbSupportsMonth(false);
        const fallback: any = await (supabase.from as any)("timesheets")
          .select(`
            id, year, week_number, status, employee_notes, manager_comments, manager_id,
            timesheet_rows(
              id, timesheet_id, billing_type_id, project_id, sun, mon, tue, wed, thu, fri, sat, weekly_total,
              sun_location, mon_location, tue_location, wed_location, thu_location, fri_location, sat_location,
              billing_type:billing_types(name),
              project:projects(code, title)
            )
          `)
          .eq("employee_id", userId)
          .eq("year", selectedYear)
          .order("week_number");

        data = fallback.data;
        error = fallback.error;
      } else {
        data = result.data;
        error = result.error;
      }

      if (cancelled) return;
      if (error) {
        console.error("Failed to load timesheet period:", error);
        setPeriodLoading(false);
        return;
      }

      const fetched = (data ?? []) as TsRow[];
      const nextEntries = buildMonthDayEntriesFromTimesheets({
        timesheets: fetched,
        year: selectedYear,
        month: selectedMonth,
      });


      const nextMonthRecord = fetched.find((item) => item.week_number === 0);
      const resolvedManager =
        nextMonthRecord?.manager_id ??
        fetched.find((item) => item.week_number > 0 && item.manager_id)?.manager_id ??
        defaultManagerId;
      const resolvedNotes = nextMonthRecord?.employee_notes ?? "";
      const nextWeek = Math.min(activeWeek, getTimesheetWeekCount(selectedYear, selectedMonth));

      setLocalTimesheets((prev) => mergeTimesheetsForPeriod(prev, fetched, selectedYear, selectedMonth));
      setDayEntries(nextEntries);
      setMonthNotes(resolvedNotes);
      setSelectedManager(resolvedManager ?? "");
      setActiveWeek(nextWeek);
      setSelectedEntryIdx(0);
      setSelectedDay(resolveSelectedDayForWeek(nextWeek, nextEntries, selectedDay));
      setEditingBilling(false);
      setEditingLocation(false);
      loadedSnapshotRef.current = buildPeriodSnapshot(nextEntries, resolvedNotes, resolvedManager ?? "");
      setPeriodReady(true);
      setPeriodLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultManagerId, selectedMonth, selectedYear, supabase, userId]);

  // Auto-save notes — always writes to the ref key
  useEffect(() => {
    if (!userId || !periodReady || !dbSupportsMonth) return;
    const nextSnapshot = buildPeriodSnapshot(dayEntries, monthNotes, selectedManager);
    if (nextSnapshot === loadedSnapshotRef.current) return;

    const timeoutId = window.setTimeout(() => {
      void persistDraftPeriod({
        targetYear: selectedYear,
        targetMonth: selectedMonth,
        nextEntries: dayEntries,
        nextNotes: monthNotes,
        nextManagerId: selectedManager,
        silent: true,
      }).then((didPersist) => {
        if (didPersist) {
          loadedSnapshotRef.current = nextSnapshot;
        }
      });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [dayEntries, monthNotes, periodReady, selectedManager, selectedMonth, selectedYear, userId]);

  // Switch month/year: save current data first, then load the new month
  function switchPeriod(newMonth: number, newYear: number) {
    void persistDraftPeriod({
      targetYear: selectedYear,
      targetMonth: selectedMonth,
      nextEntries: dayEntries,
      nextNotes: monthNotes,
      nextManagerId: selectedManager,
      silent: true,
    });
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    setActiveWeek(1);
    setSelectedEntryIdx(0);
    setSelectedDay(null);
    setEditingBilling(false);
    setEditingLocation(false);
  }

  function mergeTimesheetsForPeriod(prev: TsRow[], next: TsRow[], targetYear: number, targetMonth: number) {
    return [
      ...prev.filter((item) => !(item.year === targetYear && item.month === targetMonth)),
      ...next,
    ];
  }

  function buildPeriodSnapshot(
    entries: Record<number, TimesheetDayEntry[]>,
    notes: string,
    managerId: string
  ) {
    return JSON.stringify({ entries, notes, managerId });
  }

  function resolveSelectedDayForWeek(
    targetWeek: number,
    entries: Record<number, TimesheetDayEntry[]>,
    preferredDay: number | null
  ) {
    const weekDays = getTimesheetWeekDayNumbers(selectedYear, selectedMonth, targetWeek);
    if (preferredDay != null && weekDays.includes(preferredDay)) {
      return preferredDay;
    }

    const populatedDay = weekDays.find((day) => (entries[day] ?? []).length > 0);
    return populatedDay ?? weekDays[0] ?? null;
  }

  async function persistDraftPeriod(args: {
    targetYear: number;
    targetMonth: number;
    nextEntries: Record<number, TimesheetDayEntry[]>;
    nextNotes: string;
    nextManagerId: string;
    submit?: boolean;
    silent?: boolean;
  }) {
    if (!userId) return false;
    if (!dbSupportsMonth) {
      if (!args.silent) throw new Error("Database migration required. Please run migration 021 to enable timesheet draft persistence.");
      return false;
    }
    try {
      const { data: existingRows, error: existingError }: any = await (supabase.from as any)("timesheets")
        .select("id, year, month, week_number, status, employee_notes, manager_comments, manager_id")
        .eq("employee_id", userId)
        .eq("year", args.targetYear)
        .eq("month", args.targetMonth)
        .order("week_number");

      if (existingError) {
        if (!args.silent) console.error("Failed to read existing timesheets:", existingError);
        return false;
      }

      const existingByWeek = new Map<number, TsRow>((existingRows ?? []).map((row: TsRow) => [row.week_number, row]));
      const existingMonthRecord = existingByWeek.get(0);
      if (!args.submit && existingMonthRecord && ["submitted", "manager_approved", "approved"].includes(existingMonthRecord.status)) {
        return false;
      }
      const projectLabelById = Object.fromEntries(locationOptions.map((option) => [option.id, option.label]));
      const nowIso = new Date().toISOString();
      const refreshedWeeks: TsRow[] = [];
      const totalWeeks = getTimesheetWeekCount(args.targetYear, args.targetMonth);

      for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
        const hasWeekData = buildWeekDraftPayload(args.nextEntries, args.targetYear, args.targetMonth, weekNumber);
        const existing = existingByWeek.get(weekNumber);
        const baseStatus =
          existing?.status === "rejected" || existing?.status === "manager_rejected"
            ? existing.status
            : "draft";

        if (!hasWeekData && !existing) continue;

        let timesheetId = existing?.id;
        let updatedTimesheet: TsRow | null = null;

        if (timesheetId) {
          const { data: updated, error } = await (supabase.from as any)("timesheets")
            .update({
              status: baseStatus,
              manager_id: args.nextManagerId || null,
              employee_notes: args.nextNotes || null,
              draft_payload: hasWeekData,
              submitted_at: null,
            })
            .eq("id", timesheetId)
            .select("id, year, month, week_number, status, employee_notes, manager_comments, manager_id")
            .single();
          if (error) throw error;
          updatedTimesheet = updated as TsRow;
        } else {
          const { data: inserted, error } = await (supabase.from as any)("timesheets")
            .insert({
              employee_id: userId,
              year: args.targetYear,
              month: args.targetMonth,
              week_number: weekNumber,
              status: "draft",
              manager_id: args.nextManagerId || null,
              employee_notes: args.nextNotes || null,
              draft_payload: hasWeekData,
            })
            .select("id, year, month, week_number, status, employee_notes, manager_comments, manager_id")
            .single();
          if (error) throw error;
          timesheetId = inserted.id;
          updatedTimesheet = inserted as TsRow;
        }

        const { error: deleteRowsError } = await (supabase.from as any)("timesheet_rows")
          .delete()
          .eq("timesheet_id", timesheetId);
        if (deleteRowsError) throw deleteRowsError;

        const nextRows = buildTimesheetRowsFromEntries({
          timesheetId: timesheetId!,
          dayEntries: args.nextEntries,
          year: args.targetYear,
          month: args.targetMonth,
          week: weekNumber,
          projectLabelById,
        });

        if (nextRows.length > 0) {
          const { error: insertRowsError } = await (supabase.from as any)("timesheet_rows").insert(nextRows);
          if (insertRowsError) throw insertRowsError;
        }

        if (args.submit) {
          const { data: submittedRow, error: submitError } = await (supabase.from as any)("timesheets")
            .update({
              status: "submitted",
              manager_id: args.nextManagerId || null,
              employee_notes: args.nextNotes || null,
              submitted_at: nowIso,
            })
            .eq("id", timesheetId)
            .select("id, year, month, week_number, status, employee_notes, manager_comments, manager_id")
            .single();
          if (submitError) throw submitError;
          refreshedWeeks.push(submittedRow as TsRow);
        } else if (updatedTimesheet) {
          refreshedWeeks.push(updatedTimesheet);
        }
      }

      const hasAnyMonthDraftData = Object.values(args.nextEntries).some((entries) =>
        entries.some(hasAnyTimesheetEntryValue)
      );
      const shouldPersistMonthRecord =
        args.submit ||
        existingMonthRecord != null ||
        args.nextNotes.trim().length > 0 ||
        args.nextManagerId.trim().length > 0 ||
        hasAnyMonthDraftData;

      const refreshedMonthRows: TsRow[] = [];
      if (shouldPersistMonthRecord) {
        const monthStatus =
          args.submit
            ? "submitted"
            : existingMonthRecord?.status === "rejected" || existingMonthRecord?.status === "manager_rejected"
              ? existingMonthRecord.status
              : "draft";

        if (existingMonthRecord?.id) {
          const { data: updated, error } = await (supabase.from as any)("timesheets")
            .update({
              status: monthStatus,
              manager_id: args.nextManagerId || null,
              employee_notes: args.nextNotes || null,
              submitted_at: args.submit ? nowIso : null,
            })
            .eq("id", existingMonthRecord.id)
            .select("id, year, month, week_number, status, employee_notes, manager_comments, manager_id")
            .single();
          if (error) throw error;
          refreshedMonthRows.push(updated as TsRow);
        } else {
          const { data: inserted, error } = await (supabase.from as any)("timesheets")
            .insert({
              employee_id: userId,
              year: args.targetYear,
              month: args.targetMonth,
              week_number: 0,
              status: monthStatus,
              manager_id: args.nextManagerId || null,
              employee_notes: args.nextNotes || null,
              submitted_at: args.submit ? nowIso : null,
            })
            .select("id, year, month, week_number, status, employee_notes, manager_comments, manager_id")
            .single();
          if (error) throw error;
          refreshedMonthRows.push(inserted as TsRow);
        }
      }

      setLocalTimesheets((prev) =>
        mergeTimesheetsForPeriod(prev, [...refreshedWeeks, ...refreshedMonthRows], args.targetYear, args.targetMonth)
      );


      return true;
    } catch (error) {
      if (!args.silent) {
        console.error("Failed to persist timesheet period:", error);
      }
      return false;
    }
  }

  async function copyFromPreviousMonth() {
    if (!userId) return false;
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const { data, error }: any = await (supabase.from as any)("timesheets")
      .select(`
        week_number, draft_payload,
        timesheet_rows(
          id, timesheet_id, billing_type_id, project_id, sun, mon, tue, wed, thu, fri, sat, weekly_total,
          sun_location, mon_location, tue_location, wed_location, thu_location, fri_location, sat_location,
          billing_type:billing_types(name),
          project:projects(code, title)
        )
      `)
      .eq("employee_id", userId)
      .eq("year", prevYear)
      .eq("month", prevMonth)
      .gt("week_number", 0)
      .order("week_number");

    if (error || !(data ?? []).length) return false;

    const previousEntries = buildMonthDayEntriesFromTimesheets({
      timesheets: data ?? [],
      year: prevYear,
      month: prevMonth,
    });
    const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
    const curDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const mapped: Record<number, TimesheetDayEntry[]> = {};

    for (let day = 1; day <= curDaysInMonth; day += 1) {
      const weekday = new Date(selectedYear, selectedMonth - 1, day).getDay();
      for (let previousDay = 1; previousDay <= prevDaysInMonth; previousDay += 1) {
        const previousWeekday = new Date(prevYear, prevMonth - 1, previousDay).getDay();
        const entries = previousEntries[previousDay] ?? [];
        if (previousWeekday === weekday && entries.some(hasAnyTimesheetEntryValue)) {
          mapped[day] = entries.map((entry) => ({ ...entry }));
          break;
        }
      }
    }

    if (Object.keys(mapped).length === 0) return false;
    setDayEntries(mapped);
    return true;
  }

  // Derive selectedTs early so notes can sync
  const monthTs = localTimesheets.filter(t => t.year === selectedYear && t.month === selectedMonth);
  const weekTs = monthTs.filter((timesheet) => timesheet.week_number > 0);
  const selectedTs = weekTs.find((timesheet) => timesheet.week_number === activeWeek);
  const billingLabelById = useMemo(
    () => Object.fromEntries(billingOptions.map((option) => [option.id, option.label])),
    [billingOptions]
  );
  const locationLabelById = useMemo(
    () => Object.fromEntries(locationOptions.map((option) => [option.id, option.label])),
    [locationOptions]
  );

  const emptyEntry = emptyTimesheetDayEntry();
  const curEntry = selectedDay != null ? (dayEntries[selectedDay]?.[selectedEntryIdx] ?? emptyEntry) : null;
  function updateEntry(field: keyof TimesheetDayEntry, value: string) {
    if (selectedDay == null) return;
    setDayEntries(prev => {
      const arr = [...(prev[selectedDay] ?? [emptyEntry])];
      arr[selectedEntryIdx] = { ...(arr[selectedEntryIdx] ?? emptyEntry), [field]: value };
      return { ...prev, [selectedDay]: arr };
    });
  }
  function addEntry(day: number) {
    setDayEntries(prev => {
      const arr = [...(prev[day] ?? [emptyEntry]), { ...emptyEntry }];
      return { ...prev, [day]: arr };
    });
    setSelectedEntryIdx((dayEntries[day] ?? [emptyEntry]).length);
    setSelectedDay(day);
    setEditingBilling(false);
    setEditingLocation(false);
  }
  function removeEntry(day: number, idx: number) {
    setDayEntries(prev => {
      const arr = [...(prev[day] ?? [emptyEntry])];
      if (arr.length <= 1) return prev; // keep at least one
      arr.splice(idx, 1);
      return { ...prev, [day]: arr };
    });
    setSelectedEntryIdx(0);
    setEditingBilling(false);
    setEditingLocation(false);
  }

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const numWeeks = getTimesheetWeekCount(selectedYear, selectedMonth);

  const approvedCnt = weekTs.filter(t => t.status === "approved").length;
  const submittedCnt = weekTs.filter(t => t.status === "submitted").length;
  const submittedOrBetter = weekTs.filter(t => ["approved", "submitted", "draft"].includes(t.status ?? "")).length;
  const today             = new Date();
  const currentYear       = today.getFullYear();
  const currentMonth      = today.getMonth() + 1;
  const currentWeek       = Math.min(Math.ceil(today.getDate() / 7), 5);
  const isCurrentMonth    = selectedYear === currentYear && selectedMonth === currentMonth;
  const isFutureMonth     = selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth);
  const expectedWeeks     = isFutureMonth ? 0 : isCurrentMonth ? Math.max(0, currentWeek - 1) : numWeeks;
  const missingCnt        = Math.max(0, expectedWeeks - submittedOrBetter);

  // ── Selected-week derived state ──────────────────────────────────────────
  const isCurrentWeek = isCurrentMonth && activeWeek === currentWeek;
  const isFutureWeek  = isFutureMonth || (isCurrentMonth && activeWeek > currentWeek);
  const startDay      = (activeWeek - 1) * 7 + 1;
  const endDay        = Math.min(activeWeek * 7, daysInMonth);

  let statusLabel = "Upcoming";
  let statusDot   = "bg-gray-300";
  let statusCls   = "text-gray-400";

  if (selectedTs?.status === "approved")              { statusLabel = "Approved";         statusDot = "bg-emerald-500"; statusCls = "text-emerald-700"; }
  else if (selectedTs?.status === "manager_approved") { statusLabel = "Mgr Approved";     statusDot = "bg-blue-500";    statusCls = "text-blue-700"; }
  else if (selectedTs?.status === "submitted")        { statusLabel = "Pending";          statusDot = "bg-amber-400";   statusCls = "text-amber-600"; }
  else if (selectedTs?.status === "manager_rejected") { statusLabel = "Mgr Rejected";     statusDot = "bg-orange-400";  statusCls = "text-orange-600"; }
  else if (selectedTs?.status === "rejected")         { statusLabel = "Rejected";         statusDot = "bg-red-400";     statusCls = "text-red-600"; }
  else if (selectedTs?.status === "draft")            { statusLabel = "Draft";            statusDot = "bg-primary/50";  statusCls = "text-primary"; }
  else if (isCurrentWeek)                             { statusLabel = "In Progress";      statusDot = "bg-primary/50";  statusCls = "text-primary"; }
  else if (!isFutureWeek)                             { statusLabel = "Missing";          statusDot = "bg-red-300";     statusCls = "text-red-500"; }

  // ── Month-level record (week_number=0) for submit/approve ───────────────────
  const monthRecord = monthTs.find(t => t.week_number === 0);
  const monthSubmitted = monthRecord && ["submitted", "approved", "manager_approved"].includes(monthRecord.status);
  const monthRejected = monthRecord && ["rejected", "manager_rejected"].includes(monthRecord.status);

  // ── Submit / Approve / Reject handlers (month-level) ──────────────────────
  async function handleSubmitMonth() {
    if (!userId || submitting) return;
    if (!selectedManager) {
      alert("Please select a manager before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const didPersist = await persistDraftPeriod({
        targetYear: selectedYear,
        targetMonth: selectedMonth,
        nextEntries: dayEntries,
        nextNotes: monthNotes,
        nextManagerId: selectedManager,
        submit: true,
      });
      if (!didPersist) {
        throw new Error("Unable to submit this month.");
      }
      loadedSnapshotRef.current = buildPeriodSnapshot(dayEntries, monthNotes, selectedManager);
      router.refresh();
    } catch (err: any) {
      console.error("Submit failed:", err);
      alert(err?.message ?? "Unable to submit this month.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecallMonth() {
    if (!monthRecord?.id || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/timesheets/${monthRecord.id}/recall`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Recall failed");
      router.refresh();
    } catch (err: any) {
      console.error("Recall failed:", err);
      alert(err?.message ?? "Unable to recall this month.");
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 print-timesheet">
      {/* Print-only header */}
      <div className="hidden print:block print-header mb-4">
        <h1 className="text-xl font-bold">Timesheet — {MONTH_NAMES[selectedMonth]} {selectedYear}</h1>
        {monthRecord && (
          <div className="text-sm mt-1">
            <span className="font-semibold">Status:</span>{" "}
            {monthRecord.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
          </div>
        )}
        <hr className="mt-3 border-gray-300" />
      </div>

      {/* Header — Month / Year / Manager dropdowns + Week/Month toggle */}
      <div className="flex items-center gap-4 mb-3 flex-wrap no-print">
        <select
          value={selectedMonth}
          onChange={e => switchPeriod(Number(e.target.value), selectedYear)}
          className="select-chevron rounded-lg border border-gray-200 bg-white pl-3 pr-10 py-1.5 text-sm font-bold text-gray-800 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        >
          {MONTH_NAMES.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={e => switchPeriod(selectedMonth, Number(e.target.value))}
          className="select-chevron rounded-lg border border-gray-200 bg-white pl-3 pr-10 py-1.5 text-sm font-bold text-gray-800 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        >
          {TIMESHEET_YEAR_OPTIONS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <ManagerCombobox
          managers={managers}
          value={selectedManager}
          onChange={setSelectedManager}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={async () => {
            if (await copyFromPreviousMonth()) {
              alert("Entries copied from previous month!");
            } else {
              alert("No entries found in previous month to copy.");
            }
          }}
          className="px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
          title="Copy timesheet entries from previous month"
        >
          Copy Prev Month
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
          title="Print timesheet"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </button>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${viewMode === "week" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${viewMode === "month" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Quick-stat chips */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap no-print">
        {submittedCnt > 0 && (
          <div className="flex items-center gap-1 bg-amber-50 rounded-lg px-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400"/>
            <span className="text-[11px] font-semibold text-amber-700">{submittedCnt} Pending</span>
          </div>
        )}
        {missingCnt > 0 && (
          <div className="flex items-center gap-1 bg-red-50 rounded-lg px-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400"/>
            <span className="text-[11px] font-semibold text-red-600">{missingCnt} Missing</span>
          </div>
        )}
      </div>

      {/* ── Timesheets content ── */}
      {viewMode === "week" && (
      <div>
          {/* Horizontal week tabs */}
          <div className="flex gap-1 mb-2">
            {Array.from({ length: numWeeks }, (_, i) => {
              const w    = i + 1;
              const ts   = monthTs.find(t => t.week_number === w);
              const isCurr = isCurrentMonth && w === currentWeek;
              const isFut  = isFutureMonth || (isCurrentMonth && w > currentWeek);

              let dot = "bg-gray-200";
              if (ts?.status === "approved")              dot = "bg-emerald-500";
              else if (ts?.status === "manager_approved") dot = "bg-blue-500";
              else if (ts?.status === "submitted")        dot = "bg-amber-400";
              else if (ts?.status === "manager_rejected") dot = "bg-orange-400";
              else if (ts?.status === "rejected")         dot = "bg-red-400";
              else if (ts?.status === "draft")            dot = "bg-primary/50";
              else if (isCurr)                            dot = "bg-primary/40";
              else if (!isFut)                            dot = "bg-red-300";

              const isActive = activeWeek === w;

              return (
                <button
                  key={w}
                  onClick={() => {
                    setActiveWeek(w);
                    setSelectedEntryIdx(0);
                    setSelectedDay(resolveSelectedDayForWeek(w, dayEntries, selectedDay));
                    setEditingBilling(false);
                    setEditingLocation(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold transition-all flex-1 justify-center ${
                    isActive
                      ? "bg-primary text-white shadow-md"
                      : isCurr
                      ? "bg-white text-gray-700 shadow-sm hover:bg-primary/10 border border-primary/20"
                      : "bg-white text-gray-500 shadow-sm hover:bg-gray-50 border border-gray-100"
                  }`}
                >
                  <span>Week {w}</span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isActive ? "bg-white/70" : dot}`}/>
                </button>
              );
            })}
          </div>

          {/* Selected week detail panel */}
          <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 flex flex-col gap-3">
            {/* Total hours */}
            {(() => {
              const totalWeekHours = Array.from({ length: endDay - startDay + 1 }, (_, i) => {
                const d = startDay + i;
                return (dayEntries[d] ?? []).reduce((s, e) => s + (parseFloat(e.hours || "0") || 0), 0);
              }).reduce((sum, h) => sum + h, 0);
              return (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[15px] font-semibold text-gray-900 uppercase">Total</span>
                  <span className="text-[22px] font-extrabold text-orange-500 leading-none">{totalWeekHours.toFixed(1)}</span>
                  <span className="text-[14px] font-semibold text-gray-900">hrs</span>
                </div>
              );
            })()}

            {/* Calendar + form area */}
            <div className="bg-[#e6e9f1] rounded-xl px-5 pt-5 pb-10 -mx-1 flex flex-col gap-5">
            {/* Mon–Sun calendar row */}
            {(() => {
              const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              const slots: (number | null)[] = [null,null,null,null,null,null,null];
              for (let d = startDay; d <= endDay; d++) {
                const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();      // 0=Sun
                slots[dow] = d;
              }
              const today = new Date();
              const todayDate = today.getFullYear() === selectedYear && today.getMonth() + 1 === selectedMonth ? today.getDate() : -1;
              return (
                <div className="flex gap-1">
                  {DAY_LABELS.map((lbl, i) => {
                    const d = slots[i];
                    const isActualToday = d === todayDate;
                    const isToday = isActualToday && (selectedDay == null || selectedDay === d);
                    const isSelected = d != null && d === selectedDay;

                    return (
                      <div key={i} className="flex-1">
                        <button
                          type="button"
                          disabled={d == null}
                          onClick={() => { if (d != null) { setSelectedDay(d); setSelectedEntryIdx(0); setEditingBilling(false); setEditingLocation(false); } }}
                          className={`w-full flex flex-col items-center justify-center rounded-lg border py-3.5 transition-colors ${
                            d == null
                              ? "border-dashed border-gray-200 opacity-30 cursor-default"
                              : isSelected
                              ? "border-primary bg-primary/20 text-gray"
                              : isToday
                              ? "border-primary bg-primary/10 cursor-pointer"
                              : "border-gray-200 bg-white/60 cursor-pointer hover:border-gray-300"
                          }`}
                        >
                          <span className={`text-[14px] font-semibold leading-none ${isSelected ? "text-gray/80" : isActualToday ? "text-primary" : "text-gray-80"}`}>{lbl}</span>
                          <span className={`text-[20px] font-bold leading-tight mt-1 ${d == null ? "text-gray-300" : isSelected ? "text-gray" : isActualToday ? "text-primary" : "text-gray-700"}`}>
                            {d ?? "—"}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* 4x7 dotted matrix grid with day entry buttons overlaid */}
            {(() => {
              // Collect all entries across all days, each entry becomes a grid item
              const filledItems: { day: number; entryIdx: number; dow: number; isSelected: boolean; key: string }[] = [];
              for (let d = startDay; d <= endDay; d++) {
                const entries = dayEntries[d] ?? [];
                entries.forEach((entry, idx) => {
                  const hasFill = entry.hours || entry.projectId || entry.billingTypeId;
                  const isSel = d === selectedDay && idx === selectedEntryIdx;
                  if (hasFill || isSel) {
                    filledItems.push({ day: d, entryIdx: idx, dow: new Date(selectedYear, selectedMonth - 1, d).getDay(), isSelected: isSel, key: `${d}-${idx}` });
                  }
                });
                // If selected day has no entries, add placeholder
                if (d === selectedDay && entries.length === 0) {
                  filledItems.push({ day: d, entryIdx: 0, dow: new Date(selectedYear, selectedMonth - 1, d).getDay(), isSelected: true, key: `${d}-0` });
                }
              }

              // Assign rows: selected item at row 0, others avoid overlap (±2 cols)
              const rowAssign: Record<string, number> = {};
              const itemDows: Record<string, number> = {};
              for (const fi of filledItems) itemDows[fi.key] = fi.dow;

              const selItem = filledItems.find(f => f.isSelected);
              if (selItem) rowAssign[selItem.key] = 0;

              const others = filledItems.filter(f => !f.isSelected).sort((a, b) => a.dow - b.dow);
              for (const item of others) {
                let row = 0;
                let conflict = true;
                while (conflict) {
                  conflict = false;
                  for (const [key, assignedRow] of Object.entries(rowAssign)) {
                    if (Math.abs(itemDows[key] - item.dow) <= 2 && assignedRow === row) {
                      row++;
                      conflict = true;
                      break;
                    }
                  }
                }
                rowAssign[item.key] = row;
              }

              const maxRow = Math.max(0, ...Object.values(rowAssign));
              const rowHeight = 50;
              const gridHeight = Math.max(160, (maxRow + 1) * rowHeight + 100);

              return (
                <div className="relative mt-2" style={{ height: gridHeight }}>
                  {/* Day entry buttons */}
                  {filledItems.map(({ day, entryIdx: eIdx, dow, isSelected, key: itemKey }) => {
                    const centerPct = ((dow + 0.5) / 7) * 100;
                    const translateX = dow === 0 ? "-20%" : dow === 6 ? "-80%" : "-50%";
                    const entry = isSelected ? curEntry! : (dayEntries[day]?.[eIdx] ?? emptyEntry);
                    const row = rowAssign[itemKey] ?? 0;
                    const topPx = 4 + row * rowHeight;
                    const isSameDay = day === selectedDay;
                    const dayEntryCount = (dayEntries[day] ?? []).length;
                    const canDelete = isSelected && dayEntryCount > 1;
                    return (
                      <div
                        key={itemKey}
                        className={`absolute flex items-center gap-2 rounded-full px-3 py-1 shadow-sm w-fit ${
                          isSelected
                            ? "bg-gray-700 z-10"
                            : isSameDay
                            ? "bg-gray-700 z-[8] cursor-pointer"
                            : "bg-gray-700 z-[5] pointer-events-none overflow-hidden"
                        }`}
                        style={{ left: `${centerPct}%`, transform: `translateX(${translateX})`, top: `${topPx}px` }}
                        onClick={() => { if (!isSelected) { setSelectedDay(day); setSelectedEntryIdx(eIdx); setEditingBilling(false); setEditingLocation(false); } }}
                      >
                        <div className="flex items-baseline shrink-0">
                          {isSelected ? (
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={entry.hours}
                              onChange={e => updateEntry("hours", e.target.value)}
                              placeholder="0"
                              className="w-8 text-[22px] font-extrabold text-orange-500 bg-transparent border-none outline-none text-right p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          ) : (
                            <span className="text-[22px] font-extrabold text-orange-500">{entry.hours || "0"}</span>
                          )}
                          <span className="text-[14px] font-bold text-orange-400">hrs</span>
                        </div>
                        <div className="flex flex-col">
                          <div className="relative">
                            {isSelected ? (
                              <>
                                <button
                                  onClick={() => { setEditingLocation(!editingLocation); setEditingBilling(false); }}
                                  className="text-[13px] leading-tight font-semibold text-white cursor-pointer whitespace-nowrap"
                                >
                                  {locationLabelById[entry.projectId] || "Location"}
                                </button>
                                {editingLocation && (
                                  <>
                                  <div className="fixed inset-0 z-40" onClick={() => setEditingLocation(false)} />
                                  <div className="absolute bottom-full left-0 mb-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[200px] max-h-[180px] overflow-y-auto">
                                    {locationOptions.map((location) => (
                                      <button
                                        key={location.id}
                                        onClick={() => { updateEntry("projectId", location.id); setEditingLocation(false); }}
                                        className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary/10 transition-colors ${entry.projectId === location.id ? "text-primary font-semibold bg-primary/5" : "text-gray-700"}`}
                                      >
                                        {location.label}
                                      </button>
                                    ))}
                                  </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-[13px] leading-tight font-semibold text-white whitespace-nowrap">{locationLabelById[entry.projectId] || "Location"}</span>
                            )}
                          </div>
                          <div className="relative -mt-0.5">
                            {isSelected ? (
                              <>
                                <button
                                  onClick={() => { setEditingBilling(!editingBilling); setEditingLocation(false); }}
                                  className="text-[12px] leading-tight font-medium text-gray-300 cursor-pointer whitespace-nowrap"
                                >
                                  {billingLabelById[entry.billingTypeId] || "Billing Type"}
                                </button>
                                {editingBilling && (
                                  <>
                                  <div className="fixed inset-0 z-40" onClick={() => setEditingBilling(false)} />
                                  <div className="absolute bottom-full left-0 mb-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[200px] max-h-[180px] overflow-y-auto">
                                    {billingOptions.map((billing) => (
                                      <button
                                        key={billing.id}
                                        onClick={() => { updateEntry("billingTypeId", billing.id); setEditingBilling(false); }}
                                        className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary/10 transition-colors ${entry.billingTypeId === billing.id ? "text-primary font-semibold bg-primary/5" : "text-gray-700"}`}
                                      >
                                        {billing.label}
                                      </button>
                                    ))}
                                  </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-[12px] leading-tight font-medium text-gray-300 whitespace-nowrap">{billingLabelById[entry.billingTypeId] || "Billing Type"}</span>
                            )}
                          </div>
                        </div>
                        {/* Delete button for selected pill (keep at least 1 entry) */}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeEntry(day, eIdx); }}
                            className="ml-1 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shrink-0 transition-colors"
                            title="Remove this entry"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                          </button>
                        )}
                        {/* Fade overlay only for pills on OTHER days */}
                        {!isSelected && !isSameDay && <div className="absolute inset-0 bg-[#dce4f5]/80 rounded-full" />}
                      </div>
                    );
                  })}

                  {/* "+" button to add another entry for the selected day */}
                  {selectedDay != null && (() => {
                    const dow = new Date(selectedYear, selectedMonth - 1, selectedDay).getDay();
                    const centerPct = ((dow + 0.5) / 7) * 100;
                    // Find the lowest row used by this day's entries
                    let maxDayRow = -1;
                    for (const fi of filledItems) {
                      if (fi.day === selectedDay) {
                        const r = rowAssign[fi.key] ?? 0;
                        if (r > maxDayRow) maxDayRow = r;
                      }
                    }
                    if (maxDayRow === -1) maxDayRow = 0;
                    const topPx = 4 + (maxDayRow + 1) * rowHeight + 8;
                    return (
                      <button
                        type="button"
                        onClick={() => addEntry(selectedDay)}
                        className="absolute z-10 w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center shadow-md transition-colors"
                        style={{ left: `${centerPct}%`, transform: "translateX(-50%)", top: `${topPx}px` }}
                        title="Add another entry for this day"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/></svg>
                      </button>
                    );
                  })()}



              {/* 7 vertical dotted lines aligned under each day */}
              <div className="absolute inset-0 flex gap-1">
                {Array.from({ length: 7 }).map((_, col) => (
                  <div key={col} className="flex-1 flex justify-center">
                    <div className="h-full border-l-2 border-dotted border-gray-400/40" />
                  </div>
                ))}
              </div>
              {/* 4 horizontal dotted lines evenly spaced */}
              {Array.from({ length: 4 }).map((_, row) => (
                <div
                  key={row}
                  className="absolute left-0 right-0 border-t-2 border-dotted border-gray-400/40"
                  style={{ top: `${((row + 1) * 25) - 5}%` }}
                />
              ))}
            </div>
              );
            })()}



            </div>{/* end calendar + form area */}

          </div>

        </div>
      )}

      {/* ── Month Summary Table ── */}
      <div className={viewMode === "month" ? "" : "mt-4 border-t border-gray-100 pt-4"}>
        {viewMode === "week" ? (
        <button
          type="button"
          onClick={() => setShowSummary(prev => !prev)}
          className="w-full flex items-center justify-between mb-2 group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showSummary ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
            </svg>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider group-hover:text-gray-700 transition-colors">
              {MONTH_NAMES[selectedMonth]} {selectedYear} — Timesheet Summary
            </span>
          </div>
          {monthRecord && (
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${
                monthRecord.status === "approved" ? "bg-emerald-500"
                : monthRecord.status === "manager_approved" ? "bg-blue-500"
                : monthRecord.status === "submitted" ? "bg-amber-400"
                : monthRecord.status === "rejected" || monthRecord.status === "manager_rejected" ? "bg-red-400"
                : "bg-gray-300"
              }`} />
              <span className={`text-[11px] font-semibold ${
                monthRecord.status === "approved" ? "text-emerald-700"
                : monthRecord.status === "manager_approved" ? "text-blue-700"
                : monthRecord.status === "submitted" ? "text-amber-600"
                : monthRecord.status === "rejected" || monthRecord.status === "manager_rejected" ? "text-red-600"
                : "text-gray-400"
              }`}>
                {monthRecord.status === "approved" ? "Approved"
                  : monthRecord.status === "manager_approved" ? "Mgr Approved"
                  : monthRecord.status === "submitted" ? "Pending Approval"
                  : monthRecord.status === "rejected" ? "Rejected"
                  : monthRecord.status === "manager_rejected" ? "Mgr Rejected"
                  : "Draft"}
              </span>
            </div>
          )}
        </button>
        ) : (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {MONTH_NAMES[selectedMonth]} {selectedYear} — Timesheet Summary
            </span>
            {monthRecord && (
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  monthRecord.status === "approved" ? "bg-emerald-500"
                  : monthRecord.status === "manager_approved" ? "bg-blue-500"
                  : monthRecord.status === "submitted" ? "bg-amber-400"
                  : monthRecord.status === "rejected" || monthRecord.status === "manager_rejected" ? "bg-red-400"
                  : "bg-gray-300"
                }`} />
                <span className={`text-[11px] font-semibold ${
                  monthRecord.status === "approved" ? "text-emerald-700"
                  : monthRecord.status === "manager_approved" ? "text-blue-700"
                  : monthRecord.status === "submitted" ? "text-amber-600"
                  : monthRecord.status === "rejected" || monthRecord.status === "manager_rejected" ? "text-red-600"
                  : "text-gray-400"
                }`}>
                  {monthRecord.status === "approved" ? "Approved"
                    : monthRecord.status === "manager_approved" ? "Mgr Approved"
                    : monthRecord.status === "submitted" ? "Pending Approval"
                    : monthRecord.status === "rejected" ? "Rejected"
                    : monthRecord.status === "manager_rejected" ? "Mgr Rejected"
                    : "Draft"}
                </span>
              </div>
            )}
          </div>
        )}

        {(viewMode === "month" || showSummary) && (

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-1.5 text-left font-semibold text-gray-500 uppercase w-10 border-r border-gray-200">Wk</th>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <th key={d} className="px-1.5 py-1.5 text-center font-semibold text-gray-500 uppercase border-r border-gray-100 min-w-[72px]">{d}</th>
                ))}
                <th className="px-2 py-1.5 text-center font-semibold text-gray-500 uppercase bg-gray-100 min-w-[48px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows: React.ReactNode[] = [];
                let monthTotal = 0;

                for (let w = 1; w <= numWeeks; w++) {
                  const wStart = (w - 1) * 7 + 1;
                  const wEnd = Math.min(w * 7, daysInMonth);
                  let weekTotal = 0;

                  // Map each day of this week to its day-of-week slot (0=Sun..6=Sat)
                  const slots: (number | null)[] = [null, null, null, null, null, null, null];
                  for (let d = wStart; d <= wEnd; d++) {
                    const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
                    slots[dow] = d;
                  }

                  // Compute week total (sum all entries per day)
                  for (let d = wStart; d <= wEnd; d++) {
                    weekTotal += (dayEntries[d] ?? []).reduce((s, e) => s + (parseFloat(e.hours || "0") || 0), 0);
                  }
                  monthTotal += weekTotal;

                  rows.push(
                    <tr key={`w-${w}`} className="border-b border-gray-200">
                      <td className="px-2 py-1 align-top text-center font-bold text-gray-400 border-r border-gray-200 bg-gray-50/50">
                        {w}
                      </td>
                      {slots.map((d, col) => {
                        if (d == null) {
                          return <td key={col} className="px-1 py-1 border-r border-gray-100 bg-gray-50/30" />;
                        }
                        const entries = dayEntries[d] ?? [];
                        const hrs = entries.reduce((s, e) => s + (parseFloat(e.hours || "0") || 0), 0);
                        const isWeekend = col === 0 || col === 6;
                        return (
                          <td key={col} className={`px-1.5 py-1 align-top border-r border-gray-100 ${isWeekend ? "bg-gray-50/50" : ""}`}>
                            <div className="flex flex-col gap-0">
                              <span className="text-[10px] text-gray-400 leading-none">{d}</span>
                              <span className={`text-[13px] font-bold leading-tight tabular-nums ${hrs > 0 ? "text-orange-600" : "text-gray-200"}`}>
                                {hrs > 0 ? hrs.toFixed(1) : "—"}
                              </span>
                              {entries.filter(e => parseFloat(e.hours || "0") > 0).map((e, ei) => (
                                <div key={ei} className="flex flex-col">
                                  <span className="text-[9px] text-gray-500 leading-tight truncate" title={locationLabelById[e.projectId]}>{locationLabelById[e.projectId] || "—"}</span>
                                  <span className="text-[9px] text-gray-400 leading-tight truncate" title={billingLabelById[e.billingTypeId]}>{billingLabelById[e.billingTypeId] || "—"}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 align-top text-center bg-gray-50 font-bold text-gray-800 tabular-nums text-[13px]">
                        {weekTotal > 0 ? weekTotal.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                }

                rows.push(
                  <tr key="mt" className="bg-primary/5 border-t-2 border-primary/20">
                    <td className="px-2 py-1.5 font-bold text-gray-900 uppercase text-[10px] border-r border-gray-200">Tot</td>
                    {Array.from({ length: 7 }, (_, col) => {
                      let dayTotal = 0;
                      for (let w = 1; w <= numWeeks; w++) {
                        for (let d = (w - 1) * 7 + 1; d <= Math.min(w * 7, daysInMonth); d++) {
                          if (new Date(selectedYear, selectedMonth - 1, d).getDay() === col) {
                            dayTotal += (dayEntries[d] ?? []).reduce((s, e) => s + (parseFloat(e.hours || "0") || 0), 0);
                          }
                        }
                      }
                      return (
                        <td key={col} className="px-1.5 py-1.5 text-center font-bold text-gray-600 tabular-nums text-[11px] border-r border-gray-100">
                          {dayTotal > 0 ? dayTotal.toFixed(1) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-extrabold text-primary tabular-nums text-sm bg-primary/10">
                      {monthTotal.toFixed(1)}
                    </td>
                  </tr>
                );

                return rows;
              })()}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* ── Notes, Approval Comments, Submit (month-level) ── */}
      <div className="mt-4 border-t border-gray-100 pt-4 space-y-3 no-print">
        {/* Employee notes */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Notes — {MONTH_NAMES[selectedMonth]} {selectedYear}
          </label>
          {monthSubmitted ? (
            <p className="mt-1 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5 min-h-[2.5rem]">
              {monthNotes || "No notes added."}
            </p>
          ) : (
            <textarea
              value={monthNotes}
              onChange={(e) => setMonthNotes(e.target.value)}
              placeholder="Add notes for your manager…"
              className="mt-1 w-full border border-gray-200 rounded-lg p-2.5 text-sm resize-none h-16 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          )}
        </div>

        {/* Approval comments — read-only (managers approve via /approvals) */}
        {monthRecord?.manager_comments ? (
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Approval Comments
            </label>
            <div className={`mt-1 text-sm border rounded-lg p-2.5 ${
              monthRejected ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
            }`}>
              <span className={monthRejected ? "text-red-700" : "text-gray-700"}>
                {monthRecord.manager_comments}
              </span>
            </div>
          </div>
        ) : null}

        {/* Submit for Approval — month-level, all users */}
        {userId && (() => {
          if (monthSubmitted) {
            return (
              <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 ${
                monthRecord?.status === "approved" ? "bg-emerald-50 border border-emerald-100"
                : monthRecord?.status === "manager_approved" ? "bg-blue-50 border border-blue-100"
                : "bg-amber-50 border border-amber-100"
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  monthRecord?.status === "approved" ? "bg-emerald-500"
                  : monthRecord?.status === "manager_approved" ? "bg-blue-500"
                  : "bg-amber-400"
                }`} />
                <span className={`text-sm font-medium flex-1 ${
                  monthRecord?.status === "approved" ? "text-emerald-700"
                  : monthRecord?.status === "manager_approved" ? "text-blue-700"
                  : "text-amber-700"
                }`}>
                  {MONTH_NAMES[selectedMonth]} {selectedYear} — {
                    monthRecord?.status === "approved" ? "Approved"
                    : monthRecord?.status === "manager_approved" ? "Manager Approved"
                    : "Submitted for Approval"
                  }
                </span>
                {monthRecord?.status === "submitted" && (
                  <button
                    onClick={handleRecallMonth}
                    disabled={submitting}
                    className="text-[12px] font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {submitting ? "Recalling…" : "Recall"}
                  </button>
                )}
              </div>
            );
          }

          return (
            <button
              onClick={handleSubmitMonth}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Submitting…"
                : monthRejected
                ? `Resubmit ${MONTH_NAMES[selectedMonth]} for Approval`
                : `Submit ${MONTH_NAMES[selectedMonth]} for Approval`
              }
            </button>
          );
        })()}
      </div>

    </div>
  );
}
