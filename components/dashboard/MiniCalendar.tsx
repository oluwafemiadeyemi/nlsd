"use client";

import { useState, useEffect } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, addMonths, subMonths, addDays, subDays,
  startOfWeek, endOfWeek, isSameMonth, getISOWeek,
} from "date-fns";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = "daily" | "weekly" | "monthly" | "yearly";

interface DayActivity {
  hours:            number;
  expenses:         number;
  location?:        string;
  timesheetId?:     string;
  expenseReportId?: string;
}

interface Props { userId: string }

// ── Constants ──────────────────────────────────────────────────────────────────
const DAY_COL_KEYS  = ["sun","mon","tue","wed","thu","fri","sat"] as const;
const DAY_LABELS    = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const MONTHS_SHORT  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const IS_DEMO       = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const TABS: { key: Tab; label: string }[] = [
  { key: "daily",   label: "Daily"   },
  { key: "weekly",  label: "Weekly"  },
  { key: "monthly", label: "Monthly" },
  { key: "yearly",  label: "Yearly"  },
];

// ── Heat-map colour ────────────────────────────────────────────────────────────
function heatStyle(hours: number, todayFlag = false, sel = false): { bg?: string; fg: string } {
  if (sel)           return { bg: "#1d4ed8", fg: "#fff" };
  if (todayFlag && hours <= 0) return { fg: "#1d4ed8" };   // ring only — no fill
  if (hours <= 0)    return { fg: "#9ca3af" };
  if (hours < 2)     return { bg: "#dbeafe", fg: "#1e40af" };
  if (hours < 4)     return { bg: "#bfdbfe", fg: "#1e40af" };
  if (hours < 6)     return { bg: "#93c5fd", fg: "#1e3a8a" };
  if (hours < 8)     return { bg: "#3b82f6", fg: "#fff"    };
  return                    { bg: "#1d4ed8", fg: "#fff"    };
}

// ── Demo seed ─────────────────────────────────────────────────────────────────
function buildDemoActivity(current: Date): Map<string, DayActivity> {
  const map   = new Map<string, DayActivity>();
  const today = new Date();
  const y = current.getFullYear(), m = current.getMonth();
  const seed = [
    { d:3,  hours:8,   exp:0,   loc:undefined },
    { d:4,  hours:7.5, exp:45,  loc:"Vancouver, Canada" },
    { d:5,  hours:8,   exp:0 },
    { d:10, hours:8,   exp:120, loc:"Toronto, ON" },
    { d:11, hours:6.5, exp:85 },
    { d:12, hours:8,   exp:0 },
    { d:17, hours:8,   exp:0 },
    { d:18, hours:8,   exp:60,  loc:"Calgary, AB" },
    { d:19, hours:7,   exp:0 },
    { d:24, hours:8,   exp:0 },
    { d:25, hours:8,   exp:30 },
  ];
  for (const s of seed) {
    const date = new Date(y, m, s.d);
    if (date > today) continue;
    map.set(format(date, "yyyy-MM-dd"), {
      hours: s.hours, expenses: s.exp, location: s.loc,
      timesheetId: "demo", expenseReportId: s.exp > 0 ? "demo" : undefined,
    });
  }
  return map;
}

// ── Timesheet → per-day hours ─────────────────────────────────────────────────
function mapTimesheetsToDays(timesheets: any[]): Map<string, { hours: number; id: string }> {
  const out = new Map<string, { hours: number; id: string }>();
  for (const ts of timesheets) {
    const blockStart = new Date(ts.year, ts.month - 1, (ts.week_number - 1) * 7 + 1);
    const startDow   = blockStart.getDay();
    const totals: Record<string, number> = { sun:0,mon:0,tue:0,wed:0,thu:0,fri:0,sat:0 };
    for (const row of (ts.timesheet_rows ?? []))
      for (const col of DAY_COL_KEYS) totals[col] += Number(row[col] ?? 0);
    for (let i = 0; i < 7; i++) {
      const h = totals[DAY_COL_KEYS[i]];
      if (!h) continue;
      const d = new Date(blockStart);
      d.setDate(blockStart.getDate() + (i - startDow + 7) % 7);
      const iso  = format(d, "yyyy-MM-dd");
      const prev = out.get(iso);
      out.set(iso, { hours: (prev?.hours ?? 0) + h, id: ts.id });
    }
  }
  return out;
}

// ── Shared activity detail block ──────────────────────────────────────────────
function ActivityDetail({ act }: { act: DayActivity }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        {act.hours > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-800">{act.hours}h worked</span>
          </div>
        )}
        {act.expenses > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-800">${act.expenses.toFixed(0)} expenses</span>
          </div>
        )}
      </div>
      {act.location && (
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
            </svg>
          </div>
          <span className="text-sm text-gray-600">{act.location}</span>
        </div>
      )}
      <div className="flex gap-3 mt-0.5">
        {act.expenseReportId && act.expenseReportId !== "demo" && (
          <Link href={`/expenses/${act.expenseReportId}`} className="text-xs font-semibold text-orange-600 hover:underline">
            View Expense →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Dismiss X button ──────────────────────────────────────────────────────────
function DismissBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-gray-500 hover:text-white transition-colors ml-2 shrink-0">
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
      </svg>
    </button>
  );
}

// ── Inline detail panel (shared by weekly/monthly) ────────────────────────────
function DetailPanel({ selected, act, onClose }: { selected: string; act: DayActivity; onClose: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm shrink-0">
      <div className="bg-gray-900 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-white">
          {format(new Date(selected + "T00:00:00"), "EEEE, d MMMM")}
        </span>
        <DismissBtn onClick={onClose} />
      </div>
      <div className="bg-white px-3 py-2.5">
        <ActivityDetail act={act} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function MiniCalendar({ userId }: Props) {
  const supabase = createClient();
  const [tab,      setTab]      = useState<Tab>("monthly");
  const [current,  setCurrent]  = useState(() => new Date());
  const [activity, setActivity] = useState<Map<string, DayActivity>>(new Map());
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [yearlyData, setYearlyData] = useState<{ hours: number; expenses: number }[]>(
    Array(12).fill({ hours: 0, expenses: 0 })
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  function goBack() {
    setSelected(null);
    if (tab === "daily")   setCurrent(d => subDays(d, 1));
    else if (tab === "weekly")  setCurrent(d => subDays(d, 7));
    else if (tab === "monthly") setCurrent(d => subMonths(d, 1));
    else setCurrent(d => new Date(d.getFullYear() - 1, d.getMonth(), 1));
  }
  function goForward() {
    setSelected(null);
    if (tab === "daily")   setCurrent(d => addDays(d, 1));
    else if (tab === "weekly")  setCurrent(d => addDays(d, 7));
    else if (tab === "monthly") setCurrent(d => addMonths(d, 1));
    else setCurrent(d => new Date(d.getFullYear() + 1, d.getMonth(), 1));
  }

  // ── Header label ──────────────────────────────────────────────────────────
  function headerLabel() {
    if (tab === "daily")  return format(current, "MMMM yyyy").toUpperCase();
    if (tab === "weekly") {
      const ws = startOfWeek(current, { weekStartsOn: 1 });
      return `${format(ws, "MMM d")} – ${format(endOfWeek(current, { weekStartsOn: 1 }), "MMM d, yyyy")}`.toUpperCase();
    }
    if (tab === "monthly") return format(current, "MMMM yyyy").toUpperCase();
    return current.getFullYear().toString();
  }

  // ── Month data fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === "yearly") return;
    if (IS_DEMO) { setActivity(buildDemoActivity(current)); setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true);

    (async () => {
      const y  = current.getFullYear();
      const m  = current.getMonth() + 1;
      const s0 = format(startOfMonth(current), "yyyy-MM-dd");
      const s1 = format(endOfMonth(current),   "yyyy-MM-dd");
      const [tsRes, exRes]: any[] = await Promise.all([
        (supabase.from as any)("timesheets")
          .select("id,year,month,week_number,timesheet_rows(sun,mon,tue,wed,thu,fri,sat)")
          .eq("employee_id", userId).eq("year", y).eq("month", m).gt("week_number", 0),
        (supabase.from as any)("expense_entries")
          .select("entry_date,mileage_cost,lodging_amount,breakfast_amount,lunch_amount,dinner_amount,other_amount,expense_reports(id,destination)")
          .gte("entry_date", s0).lte("entry_date", s1),
      ]);
      if (ac.signal.aborted) return;

      const map = new Map<string, DayActivity>();
      const get = (iso: string) => { if (!map.has(iso)) map.set(iso, { hours:0, expenses:0 }); return map.get(iso)!; };

      for (const [iso, { hours, id }] of mapTimesheetsToDays(tsRes.data ?? [])) {
        const a = get(iso); a.hours += hours;
        if (!a.timesheetId) a.timesheetId = id;
      }
      for (const entry of (exRes.data ?? [])) {
        const total = [entry.mileage_cost, entry.lodging_amount,
          entry.breakfast_amount, entry.lunch_amount, entry.dinner_amount, entry.other_amount,
        ].reduce((s: number, v: any) => s + Number(v ?? 0), 0);
        const rpt = Array.isArray(entry.expense_reports) ? entry.expense_reports[0] : entry.expense_reports;
        const a = get(entry.entry_date as string);
        a.expenses += total;
        if (!a.expenseReportId && rpt) { a.expenseReportId = rpt.id; a.location = rpt.destination ?? undefined; }
      }
      setActivity(map);
      setLoading(false);
    })();
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, userId, tab]);

  // ── Yearly data fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "yearly") return;
    if (IS_DEMO) {
      const now = new Date();
      setYearlyData(MONTHS_SHORT.map((_, i) => ({
        hours:    i <= now.getMonth() ? Math.round((Math.sin(i) + 1.5) * 60) : 0,
        expenses: i <= now.getMonth() ? Math.round((Math.cos(i) + 1.2) * 80) : 0,
      })));
      return;
    }
    const ac = new AbortController();
    const year = current.getFullYear();
    (async () => {
      const { data }: any = await (supabase.from as any)("timesheets")
        .select("month, timesheet_weeks(total_hours)")
        .eq("employee_id", userId).eq("year", year);
      if (ac.signal.aborted) return;
      const h = Array(12).fill(0);
      for (const ts of (data ?? []))
        for (const w of (ts.timesheet_weeks ?? []))
          h[(ts.month ?? 1) - 1] += Number(w.total_hours ?? 0);
      setYearlyData(h.map(hours => ({ hours, expenses: 0 })));
    })();
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, userId, tab]);

  // ── Monthly grid ──────────────────────────────────────────────────────────
  const monthStart = startOfMonth(current);
  const days       = eachDayOfInterval({ start: monthStart, end: endOfMonth(current) });
  const prefixLen  = (() => { const d = getDay(monthStart); return d === 0 ? 6 : d - 1; })();
  const allCells   = [...Array(prefixLen).fill(null), ...days];
  if (allCells.length % 7) allCells.push(...Array(7 - (allCells.length % 7)).fill(null));
  const monthWeeks: (Date | null)[][] = [];
  for (let i = 0; i < allCells.length; i += 7) monthWeeks.push(allCells.slice(i, i + 7));

  // ── Weekly strip ──────────────────────────────────────────────────────────
  const weekStart = startOfWeek(current, { weekStartsOn: 1 });
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // ── Month totals ──────────────────────────────────────────────────────────
  let totalHours = 0, totalExpenses = 0;
  for (const a of activity.values()) { totalHours += a.hours; totalExpenses += a.expenses; }

  const currentIso = format(current, "yyyy-MM-dd");
  const selAct     = selected ? activity.get(selected) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">

      {/* ═══════════════════ HEADER ═══════════════════ */}
      <div className="flex items-center justify-between mb-3 shrink-0 gap-2 flex-wrap">

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button onClick={goBack}
            className="w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">
            <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
          <span className="text-[10px] font-bold text-gray-700 tracking-wide min-w-[100px]">{headerLabel()}</span>
          <button onClick={goForward}
            className="w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">
            <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
          {loading && tab !== "yearly" && (
            <div className="w-2.5 h-2.5 rounded-full border-2 border-primary border-t-transparent animate-spin ml-1" />
          )}
        </div>

        {/* Segmented tab control */}
        <div className="flex items-center bg-gray-100 rounded-full p-0.5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelected(null); }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all whitespace-nowrap
                ${tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}
              `}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ DAILY VIEW ═══════════════════ */}
      {tab === "daily" && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">

          {/* Big day card */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-2xl flex flex-col items-center justify-center px-5 py-3 shrink-0"
              style={{ background: "#1d4ed8" }}>
              <span className="text-white text-[11px] font-semibold opacity-75 leading-none">
                {format(current, "EEEE")}
              </span>
              <span className="text-white text-4xl font-extrabold leading-tight">
                {format(current, "d")}
              </span>
            </div>
          </div>

          {/* Day activity list */}
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0">
            {(() => {
              const act = activity.get(currentIso);
              if (!act) return (
                <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center gap-1 py-8">
                  <svg className="w-8 h-8 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <p className="text-xs text-gray-400">No activity for this day</p>
                </div>
              );
              return (
                <>
                  {/* Hours worked row */}
                  {act.hours > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-primary">Hours Worked</p>
                        <p className="text-xs text-primary/70">Timesheet entry</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-extrabold text-primary leading-none">{act.hours}</p>
                        <p className="text-[10px] text-primary/70 font-medium">hrs</p>
                      </div>
                    </div>
                  )}

                  {/* Location row */}
                  {act.location && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-emerald-900">Work Location</p>
                        <p className="text-xs text-emerald-600 truncate">{act.location}</p>
                      </div>
                    </div>
                  )}

                  {/* Expenses row */}
                  {act.expenses > 0 && (
                    <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-orange-900">Expenses</p>
                        <p className="text-xs text-orange-600">Claimed amount</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-extrabold text-orange-600 leading-none">${act.expenses.toFixed(0)}</p>
                        <p className="text-[10px] text-orange-400 font-medium">total</p>
                      </div>
                    </div>
                  )}

                  {/* Quick links */}
                  {act.expenseReportId && act.expenseReportId !== "demo" && (
                    <div className="flex gap-2 pt-0.5">
                      <Link href={`/expenses/${act.expenseReportId}`}
                        className="flex-1 text-center text-[11px] font-semibold text-orange-600 border border-orange-200 bg-white rounded-lg py-1.5 hover:bg-orange-50 transition-colors">
                        View Expense →
                      </Link>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════════════ WEEKLY VIEW ═══════════════════ */}
      {tab === "weekly" && (
        <div className="flex-1 flex flex-col gap-2 min-h-0">

          {/* 7-day grid */}
          <div className="grid grid-cols-7 gap-1 shrink-0">
            {weekDays.map((day, di) => {
              const iso    = format(day, "yyyy-MM-dd");
              const act    = activity.get(iso);
              const sel    = selected === iso;
              const tod    = isToday(day);
              const { bg, fg } = heatStyle(act?.hours ?? 0, tod, sel);
              const inMonth = isSameMonth(day, current);
              return (
                <button
                  key={iso}
                  onClick={() => act ? setSelected(sel ? null : iso) : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 transition-all border
                    ${act ? "cursor-pointer hover:opacity-90" : "cursor-default"}
                    ${tod && !sel ? "ring-2 ring-primary ring-inset border-transparent" : "border-transparent"}
                    ${sel ? "border-primary/40" : ""}
                  `}
                  style={{ background: bg }}
                >
                  <span className="text-[10px] font-semibold" style={{ color: fg, opacity: inMonth ? 1 : 0.4 }}>
                    {DAY_LABELS[di]}
                  </span>
                  <span className="text-lg font-extrabold leading-tight" style={{ color: fg, opacity: inMonth ? 1 : 0.4 }}>
                    {format(day, "d")}
                  </span>
                  {(act?.hours ?? 0) > 0 && (
                    <span className="text-[9px] font-bold" style={{ color: fg, opacity: 0.8 }}>
                      {act!.hours}h
                    </span>
                  )}
                  {(act?.expenses ?? 0) > 0 && (
                    <div className="w-4/5 mt-0.5">
                      <div className="h-0.5 rounded-full" style={{ background: sel ? "rgba(251,146,60,0.8)" : "#fb923c" }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Week summary row */}
          {(() => {
            const wkH = weekDays.reduce((s, d) => s + (activity.get(format(d,"yyyy-MM-dd"))?.hours ?? 0), 0);
            const wkE = weekDays.reduce((s, d) => s + (activity.get(format(d,"yyyy-MM-dd"))?.expenses ?? 0), 0);
            return (
              <div className="flex items-center gap-2 px-0.5 shrink-0">
                <span className="text-[11px] font-bold text-gray-600">Week {getISOWeek(current)}</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary">
                  {wkH.toFixed(0)}h
                </span>
                {wkE > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-100 text-[10px] font-bold text-orange-600">
                    ${wkE.toFixed(0)}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Selected day detail */}
          {selected && selAct && (
            <DetailPanel selected={selected} act={selAct} onClose={() => setSelected(null)} />
          )}
        </div>
      )}

      {/* ═══════════════════ MONTHLY VIEW ═══════════════════ */}
      {tab === "monthly" && (
        <div className="flex-1 flex flex-col min-h-0">

          {/* Summary pills */}
          <div className="flex items-center gap-1.5 mb-2 shrink-0">
            <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-700">
              {totalHours.toFixed(0)}h
            </span>
            {totalExpenses > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-100 text-[10px] font-bold text-orange-600">
                ${totalExpenses.toFixed(0)}
              </span>
            )}
          </div>

          {/* Selected day detail */}
          {selected && selAct && (
            <div className="mb-2 shrink-0">
              <DetailPanel selected={selected} act={selAct} onClose={() => setSelected(null)} />
            </div>
          )}

          {/* Day-of-week headers + Wk column */}
          <div className="grid shrink-0" style={{ gridTemplateColumns: "repeat(7,1fr) 24px" }}>
            {DAY_LABELS.map(d => (
              <span key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-1">{d}</span>
            ))}
            <span className="text-center text-[10px] font-semibold text-gray-300 pb-1">W</span>
          </div>

          {/* Week rows */}
          <div className={`flex-1 flex flex-col gap-0.5 transition-opacity duration-150 ${loading ? "opacity-40" : ""}`}>
            {monthWeeks.map((week, wi) => {
              const wkH = week.reduce((sum, day) =>
                sum + (day ? (activity.get(format(day,"yyyy-MM-dd"))?.hours ?? 0) : 0), 0);
              return (
                <div key={wi} className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: "repeat(7,1fr) 24px" }}>
                  {week.map((day, di) => {
                    if (!day) return <div key={`e${di}`} />;
                    const iso    = format(day, "yyyy-MM-dd");
                    const act    = activity.get(iso);
                    const sel    = selected === iso;
                    const tod    = isToday(day);
                    const { bg, fg } = heatStyle(act?.hours ?? 0, tod, sel);
                    const hasAct = !!(act && (act.hours > 0 || act.expenses > 0));
                    return (
                      <button
                        key={iso}
                        onClick={() => hasAct ? setSelected(sel ? null : iso) : undefined}
                        className={`relative flex flex-col items-center justify-center rounded-lg w-full h-full transition-all
                          ${hasAct ? "cursor-pointer hover:opacity-85" : "cursor-default"}
                          ${tod && !sel ? "ring-2 ring-primary ring-inset" : ""}
                        `}
                        style={{ background: bg }}
                      >
                        <span className="text-[11px] font-semibold leading-none" style={{ color: fg }}>
                          {format(day, "d")}
                        </span>
                        {(act?.hours ?? 0) > 0 && (
                          <span className="text-[8px] leading-none mt-px font-medium opacity-75" style={{ color: fg }}>
                            {act!.hours! % 1 === 0 ? `${act!.hours}h` : `${act!.hours!.toFixed(1)}h`}
                          </span>
                        )}
                        {(act?.expenses ?? 0) > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg"
                            style={{ background: sel ? "rgba(251,146,60,0.8)" : "#fb923c" }} />
                        )}
                      </button>
                    );
                  })}
                  <div className="flex items-center justify-center">
                    <span className={`text-[9px] font-bold leading-none ${wkH > 0 ? "text-gray-400" : "text-gray-200"}`}>
                      {wkH > 0 ? `${wkH.toFixed(0)}h` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-1.5 shrink-0 flex-wrap">
            {[{ bg:"#dbeafe",label:"<4h"},{bg:"#93c5fd",label:"4–6h"},{bg:"#3b82f6",label:"6–8h"},{bg:"#1d4ed8",label:"8h+"}]
              .map(({ bg, label }) => (
                <span key={label} className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-3 h-2 rounded-sm shrink-0" style={{ background: bg }} />{label}
                </span>
              ))}
            <span className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
              <span className="inline-block w-3 h-0.5 rounded-sm bg-orange-400 shrink-0" />Expense
            </span>
          </div>
        </div>
      )}

      {/* ═══════════════════ YEARLY VIEW ═══════════════════ */}
      {tab === "yearly" && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_SHORT.map((label, mi) => {
              const { hours, expenses } = yearlyData[mi] ?? { hours: 0, expenses: 0 };
              const isCurMonth = mi === new Date().getMonth() && current.getFullYear() === new Date().getFullYear();
              const maxH = Math.max(...yearlyData.map(d => d.hours), 1);
              const pct  = Math.min(Math.round((hours / maxH) * 100), 100);
              return (
                <button
                  key={mi}
                  onClick={() => { setCurrent(new Date(current.getFullYear(), mi, 1)); setTab("monthly"); }}
                  className={`rounded-xl p-2.5 text-left border transition-all hover:shadow-sm
                    ${isCurMonth ? "border-primary/40 bg-primary/10" : "border-gray-100 bg-white hover:border-primary/25"}
                  `}
                >
                  <p className={`text-[11px] font-bold mb-2 ${isCurMonth ? "text-primary" : "text-gray-700"}`}>
                    {label}
                  </p>
                  {hours > 0 ? (
                    <>
                      <div className="w-full h-1 rounded-full bg-gray-100 mb-1.5">
                        <div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] font-bold text-gray-700">{hours.toFixed(0)}h</p>
                      {expenses > 0 && (
                        <p className="text-[10px] text-orange-500">${expenses.toFixed(0)}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="w-full h-1 rounded-full bg-gray-100 mb-1.5" />
                      <p className="text-[10px] text-gray-300">—</p>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">Tap a month to view details</p>
        </div>
      )}

    </div>
  );
}
