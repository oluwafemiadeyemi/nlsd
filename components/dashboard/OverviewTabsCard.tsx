"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";


const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];

const TABS = ["Timesheets"] as const;
type Tab = typeof TABS[number];

const BILLING_TYPES = [
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

const LOCATIONS = [
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

const EXPENSE_STRIPES = [
  "#f97316",
  "repeating-linear-gradient(135deg,#fb923c 0px,#fb923c 4px,#fed7aa 4px,#fed7aa 8px)",
  "repeating-linear-gradient(135deg,#fbbf24 0px,#fbbf24 4px,#fef3c7 4px,#fef3c7 8px)",
  "repeating-linear-gradient(135deg,#84cc16 0px,#84cc16 4px,#ecfccb 4px,#ecfccb 8px)",
];

const EXPENSE_CATS = [
  { key: "mileage" as const, label: "Mileage Cost" },
  { key: "meals" as const, label: "Meals" },
  { key: "lodging" as const, label: "Lodge" },
  { key: "other" as const, label: "Other" },
];

interface TsRow { id: string; week_number: number; status: string; month?: number; year?: number; employee_notes?: string | null; manager_comments?: string | null; }
interface ExRow { id: string; week_number: number; year: number; status: string; }

interface Props {
  year: number;
  month: number;
  week: number;
  realTimesheets: TsRow[];
  realExpenses: ExRow[];
  newExHref: string;
  userRole?: "employee" | "manager" | "admin" | "finance";
  userId?: string;
}

export function OverviewTabsCard({ year, month, week, realTimesheets, realExpenses, newExHref, userRole = "employee", userId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Timesheets");
  const [activeWeek, setActiveWeek] = useState<number>(week);
  const [selectedMonth, setSelectedMonth] = useState<number>(month);
  const [selectedYear, setSelectedYear] = useState<number>(year);
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<number | null>(() => {
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() + 1 === month) return now.getDate();
    return null;
  });
  type DayEntry = { billingType: string; project: string; hours: string; manager: string; mileage: string; meals: string; lodging: string; other: string };
  const [dayEntries, setDayEntries] = useState<Record<number, DayEntry[]>>({});
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const [editingBilling, setEditingBilling] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [monthNotes, setMonthNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [approvalComment, setApprovalComment] = useState("");
  const [localTimesheets, setLocalTimesheets] = useState<TsRow[]>(realTimesheets);
  const router = useRouter();
  const supabase = createClient();
  const isManager = userRole === "manager" || userRole === "admin" || userRole === "finance";

  // Sync localTimesheets when server data changes
  useEffect(() => { setLocalTimesheets(realTimesheets); }, [realTimesheets]);

  // Track which month/year the current dayEntries + notes belong to
  const activeKeyRef = useRef(`${selectedYear}-${selectedMonth}`);

  // Load from localStorage after hydration
  useEffect(() => {
    const key = `${selectedYear}-${selectedMonth}`;
    try {
      const saved = localStorage.getItem(`dayEntries-${key}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate old format (single entry per day) to new format (array per day)
        const migrated: Record<number, DayEntry[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
          migrated[Number(k)] = Array.isArray(v) ? v as DayEntry[] : [v as DayEntry];
        }
        setDayEntries(migrated);
      }
    } catch {}
    try {
      const saved = localStorage.getItem(`monthNotes-${key}`);
      setMonthNotes(saved ?? "");
    } catch {}
    activeKeyRef.current = key;
    setHydrated(true);
  }, []);

  // Auto-save entries — always writes to the ref key (the month the data belongs to)
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(`dayEntries-${activeKeyRef.current}`, JSON.stringify(dayEntries));
  }, [dayEntries, hydrated]);

  // Auto-save notes — always writes to the ref key
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(`monthNotes-${activeKeyRef.current}`, monthNotes);
  }, [monthNotes, hydrated]);

  // Switch month/year: save current data first, then load the new month
  function switchPeriod(newMonth: number, newYear: number) {
    if (hydrated) {
      // Flush current data to the OLD key before switching
      localStorage.setItem(`dayEntries-${activeKeyRef.current}`, JSON.stringify(dayEntries));
      localStorage.setItem(`monthNotes-${activeKeyRef.current}`, monthNotes);
    }
    const newKey = `${newYear}-${newMonth}`;
    // Load new month's data
    let loadedEntries: Record<number, DayEntry[]> = {};
    let loadedNotes = "";
    try {
      const saved = localStorage.getItem(`dayEntries-${newKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [k, v] of Object.entries(parsed)) {
          loadedEntries[Number(k)] = Array.isArray(v) ? v as DayEntry[] : [v as DayEntry];
        }
      }
    } catch {}
    try {
      const saved = localStorage.getItem(`monthNotes-${newKey}`);
      loadedNotes = saved ?? "";
    } catch {}
    // Update ref BEFORE setting state so auto-save targets the new key
    activeKeyRef.current = newKey;
    setDayEntries(loadedEntries);
    setMonthNotes(loadedNotes);
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    setActiveWeek(1);
    setSelectedDay(null);
  }

  function copyFromPreviousMonth() {
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const prevKey = `${prevYear}-${prevMonth}`;
    try {
      const saved = localStorage.getItem(`dayEntries-${prevKey}`);
      if (!saved) return false;
      const parsed = JSON.parse(saved);
      // Re-map day entries: match by day-of-week, not day number
      const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
      const curDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const mapped: Record<number, DayEntry[]> = {};
      for (let d = 1; d <= curDaysInMonth; d++) {
        const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
        // Find a day in the previous month with the same day-of-week
        for (let pd = 1; pd <= prevDaysInMonth; pd++) {
          const pDow = new Date(prevYear, prevMonth - 1, pd).getDay();
          if (pDow === dow && parsed[pd]) {
            const entries = Array.isArray(parsed[pd]) ? parsed[pd] : [parsed[pd]];
            if (entries.some((e: DayEntry) => e.hours || e.billingType || e.project)) {
              mapped[d] = entries;
              break;
            }
          }
        }
      }
      if (Object.keys(mapped).length === 0) return false;
      setDayEntries(mapped);
      return true;
    } catch { return false; }
  }

  // Derive selectedTs early so notes can sync
  const monthTs     = localTimesheets.filter(t => t.year === selectedYear && t.month === selectedMonth);
  const selectedTs  = monthTs.find(t => t.week_number === activeWeek);

  const emptyEntry: DayEntry = { billingType: "", project: "", hours: "", manager: "", mileage: "", meals: "", lodging: "", other: "" };
  const curEntry = selectedDay != null ? (dayEntries[selectedDay]?.[selectedEntryIdx] ?? emptyEntry) : null;
  function updateEntry(field: keyof DayEntry, value: string) {
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

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const numWeeks    = Math.min(Math.ceil(daysInMonth / 7), 5);

  const approvedCnt       = monthTs.filter(t => t.status === "approved").length;
  const submittedCnt      = monthTs.filter(t => t.status === "submitted").length;
  const submittedOrBetter = monthTs.filter(t => ["approved","submitted","draft"].includes(t.status ?? "")).length;
  const missingCnt        = Math.max(0, Math.max(0, week - 1) - submittedOrBetter);

  // ── Selected-week derived state ──────────────────────────────────────────
  const isCurrentWeek = activeWeek === week;
  const isFutureWeek  = activeWeek > week;
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
    setSubmitting(true);
    try {
      // Look up the employee's manager
      const { data: emRow }: any = await (supabase as any)
        .from("employee_manager")
        .select("manager_id")
        .eq("employee_id", userId)
        .maybeSingle();
      const managerId = emRow?.manager_id ?? null;

      const { data: existing }: any = await (supabase as any)
        .from("timesheets")
        .select("id")
        .eq("employee_id", userId)
        .eq("year", selectedYear)
        .eq("month", selectedMonth)
        .eq("week_number", 0)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existing?.id) {
        await (supabase as any).from("timesheets").update({
          status: "submitted",
          employee_notes: monthNotes || null,
          manager_id: managerId,
          submitted_at: now,
        }).eq("id", existing.id);
      } else {
        await (supabase as any).from("timesheets").insert({
          employee_id: userId,
          year: selectedYear,
          month: selectedMonth,
          week_number: 0,
          status: "submitted",
          employee_notes: monthNotes || null,
          manager_id: managerId,
          submitted_at: now,
        });
      }

      setLocalTimesheets(prev => {
        const idx = prev.findIndex(t => t.year === selectedYear && t.month === selectedMonth && t.week_number === 0);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], status: "submitted", employee_notes: monthNotes || null };
          return updated;
        }
        return [...prev, { id: "temp-" + Date.now(), year: selectedYear, month: selectedMonth, week_number: 0, status: "submitted", employee_notes: monthNotes || null, manager_comments: null }];
      });
      router.refresh();
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecallMonth() {
    if (!monthRecord?.id || submitting) return;
    setSubmitting(true);
    try {
      await (supabase as any).from("timesheets").update({
        status: "draft",
        submitted_at: null,
      }).eq("id", monthRecord.id);

      setLocalTimesheets(prev =>
        prev.map(t => t.id === monthRecord.id ? { ...t, status: "draft" } : t)
      );
      router.refresh();
    } catch (err) {
      console.error("Recall failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApproval(action: "approved" | "rejected") {
    if (!monthRecord?.id || submitting) return;
    setSubmitting(true);
    try {
      await (supabase as any).from("timesheets").update({
        status: action,
        manager_comments: approvalComment || null,
      }).eq("id", monthRecord.id);

      setLocalTimesheets(prev =>
        prev.map(t => t.id === monthRecord.id ? { ...t, status: action, manager_comments: approvalComment || null } : t)
      );
      setApprovalComment("");
      router.refresh();
    } catch (err) {
      console.error("Approval action failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  // Load approval comment from month record
  useEffect(() => {
    if (isManager && monthRecord?.manager_comments) {
      setApprovalComment(monthRecord.manager_comments);
    } else {
      setApprovalComment("");
    }
  }, [monthRecord?.id]);

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      {/* Header — Month / Year / Manager dropdowns + Week/Month toggle */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
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
          {[year - 1, year, year + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-800">Manager</span>
          <select
            value={selectedManager}
            onChange={e => setSelectedManager(e.target.value)}
            className="select-chevron rounded-lg border border-gray-200 bg-white pl-3 pr-10 py-1.5 text-sm text-gray-700 min-w-[180px] cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          >
            <option value="">Select…</option>
          </select>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (copyFromPreviousMonth()) {
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
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
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
              const isCurr = w === week;
              const isFut  = w > week;

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
                  onClick={() => setActiveWeek(w)}
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
                  const hasFill = entry.hours || entry.project || entry.billingType;
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
              const rowHeight = 40;
              // Check if any day has expense data — need extra height for expense bars below pills
              let hasAnyExpense = false;
              for (let d = startDay; d <= endDay; d++) {
                const entries = dayEntries[d] ?? [];
                for (const ex of entries) {
                  const et = (parseFloat(ex.mileage || "0") || 0) + (parseFloat(ex.meals || "0") || 0) + (parseFloat(ex.lodging || "0") || 0) + (parseFloat(ex.other || "0") || 0);
                  if (et > 0) { hasAnyExpense = true; break; }
                }
                if (hasAnyExpense) break;
              }
              const expenseExtra = hasAnyExpense ? 30 : 0;
              const gridHeight = Math.max(160, (maxRow + 1) * rowHeight + 80 + expenseExtra);

              return (
                <div className="relative mt-2" style={{ height: gridHeight }}>
                  {/* Day entry buttons */}
                  {filledItems.map(({ day, entryIdx: eIdx, dow, isSelected, key: itemKey }) => {
                    const centerPct = ((dow + 0.5) / 7) * 100;
                    const translateX = dow === 0 ? "-20%" : dow === 6 ? "-80%" : "-50%";
                    const entry = isSelected ? curEntry! : (dayEntries[day]?.[eIdx] ?? emptyEntry);
                    const row = rowAssign[itemKey] ?? 0;
                    const topPx = 4 + row * rowHeight;
                    return (
                      <div
                        key={itemKey}
                        className={`absolute flex items-center gap-2 rounded-full px-3 py-1 shadow-sm w-fit ${isSelected ? "bg-gray-700 z-10" : "bg-gray-700 z-[5] pointer-events-none overflow-hidden"}`}
                        style={{ left: `${centerPct}%`, transform: `translateX(${translateX})`, top: `${topPx}px` }}
                        onClick={() => { if (!isSelected) { setSelectedDay(day); setSelectedEntryIdx(eIdx); } }}
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
                                  {entry.project || "Location"}
                                </button>
                                {editingLocation && (
                                  <>
                                  <div className="fixed inset-0 z-40" onClick={() => setEditingLocation(false)} />
                                  <div className="absolute bottom-full left-0 mb-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[200px] max-h-[180px] overflow-y-auto">
                                    {LOCATIONS.map(loc => (
                                      <button
                                        key={loc}
                                        onClick={() => { updateEntry("project", loc); setEditingLocation(false); }}
                                        className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary/10 transition-colors ${entry.project === loc ? "text-primary font-semibold bg-primary/5" : "text-gray-700"}`}
                                      >
                                        {loc}
                                      </button>
                                    ))}
                                  </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-[13px] leading-tight font-semibold text-white whitespace-nowrap">{entry.project || "Location"}</span>
                            )}
                          </div>
                          <div className="relative -mt-0.5">
                            {isSelected ? (
                              <>
                                <button
                                  onClick={() => { setEditingBilling(!editingBilling); setEditingLocation(false); }}
                                  className="text-[12px] leading-tight font-medium text-gray-300 cursor-pointer whitespace-nowrap"
                                >
                                  {entry.billingType || "Billing Type"}
                                </button>
                                {editingBilling && (
                                  <>
                                  <div className="fixed inset-0 z-40" onClick={() => setEditingBilling(false)} />
                                  <div className="absolute bottom-full left-0 mb-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[200px] max-h-[180px] overflow-y-auto">
                                    {BILLING_TYPES.map(bt => (
                                      <button
                                        key={bt}
                                        onClick={() => { updateEntry("billingType", bt); setEditingBilling(false); }}
                                        className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary/10 transition-colors ${entry.billingType === bt ? "text-primary font-semibold bg-primary/5" : "text-gray-700"}`}
                                      >
                                        {bt}
                                      </button>
                                    ))}
                                  </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-[12px] leading-tight font-medium text-gray-300 whitespace-nowrap">{entry.billingType || "Billing Type"}</span>
                            )}
                          </div>
                        </div>
                        {!isSelected && <div className="absolute inset-0 bg-[#dce4f5]/80 rounded-full" />}
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
                    const topPx = 4 + (maxDayRow + 1) * rowHeight - 4;
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

                  {/* Expense bars on the grid — positioned below timesheet pills */}
                  {(() => {
                    const expDays: { day: number; dow: number; expTotal: number; expCats: { amount: number; idx: number }[] }[] = [];
                    for (let d = startDay; d <= endDay; d++) {
                      const entries = dayEntries[d] ?? [];
                      // Sum expenses across all entries for this day
                      const amts = [0, 0, 0, 0];
                      for (const exp of entries) {
                        amts[0] += parseFloat(exp.mileage || "0") || 0;
                        amts[1] += parseFloat(exp.meals || "0") || 0;
                        amts[2] += parseFloat(exp.lodging || "0") || 0;
                        amts[3] += parseFloat(exp.other || "0") || 0;
                      }
                      const total = amts[0] + amts[1] + amts[2] + amts[3];
                      if (total > 0) {
                        expDays.push({
                          day: d,
                          dow: new Date(selectedYear, selectedMonth - 1, d).getDay(),
                          expTotal: total,
                          expCats: amts.map((a, idx) => ({ amount: a, idx })).filter(c => c.amount > 0),
                        });
                      }
                    }
                    return expDays.map(({ day, dow, expTotal, expCats: eCats }) => {
                      const centerPct = ((dow + 0.5) / 7) * 100;
                      // Find the max row for this day's entries
                      let maxDayRow = 0;
                      for (const fi of filledItems) {
                        if (fi.day === day) {
                          const r = rowAssign[fi.key] ?? 0;
                          if (r > maxDayRow) maxDayRow = r;
                        }
                      }
                      const topPx = 4 + maxDayRow * rowHeight + 36;
                      return (
                        <div
                          key={`exp-${day}`}
                          className="absolute z-[4] flex flex-col items-center"
                          style={{ left: `${centerPct}%`, transform: "translateX(-50%)", top: `${topPx}px`, width: 60 }}
                        >
                          <p className="text-[8px] font-bold text-gray-500 text-center leading-none mb-0.5">${expTotal.toFixed(0)}</p>
                          <div className="flex gap-px rounded overflow-hidden w-full" style={{ height: 6 }}>
                            {eCats.map((c, ci) => (
                              <div
                                key={c.idx}
                                style={{
                                  flex: c.amount,
                                  background: EXPENSE_STRIPES[c.idx],
                                  borderRadius: ci === 0 && ci === eCats.length - 1 ? "3px"
                                    : ci === 0 ? "3px 1px 1px 3px"
                                    : ci === eCats.length - 1 ? "1px 3px 3px 1px"
                                    : "1px",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    });
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
            {/* ── Daily Expense Input — dashboard card style ── */}
            {selectedDay != null && (() => {
              const exp = dayEntries[selectedDay]?.[selectedEntryIdx] ?? emptyEntry;
              const amts = [
                parseFloat(exp.mileage || "0") || 0,
                parseFloat(exp.meals || "0") || 0,
                parseFloat(exp.lodging || "0") || 0,
                parseFloat(exp.other || "0") || 0,
              ];
              const total = amts[0] + amts[1] + amts[2] + amts[3];
              const cats = amts.map((a, idx) => ({ amount: a, idx, ...EXPENSE_CATS[idx] })).filter(c => c.amount > 0);

              return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 pt-3 pb-3 mt-4">
                  {/* Header: label + total */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex flex-col">
                      <span className="text-[15px] font-semibold text-gray-700">Expense</span>
                      <span className="text-[11px] text-gray-400 font-medium">
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(selectedYear, selectedMonth - 1, selectedDay).getDay()]}, {MONTH_NAMES[selectedMonth].slice(0,3)} {selectedDay}
                      </span>
                    </div>
                    <span className="text-[32px] font-extrabold text-gray-900 leading-none tracking-tight">
                      ${total.toFixed(0)}
                    </span>
                  </div>

                  {/* Category inputs */}
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {EXPENSE_CATS.map((cat, idx) => (
                      <div key={cat.key}>
                        <label className="text-[10px] font-medium text-gray-500 leading-none">{cat.label}</label>
                        <div className="relative mt-0.5">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={exp[cat.key] ?? ""}
                            onChange={e => updateEntry(cat.key, e.target.value)}
                            placeholder="0"
                            className="w-full pl-5 pr-1 py-1.5 text-[13px] font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg text-right outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Proportional stripe bars — labels + bars */}
                  {total > 0 && (
                    <>
                      <div className="flex gap-1 mb-1">
                        {cats.map((c) => (
                          <div key={c.key} style={{ flex: c.amount, minWidth: 0 }}>
                            <p className="text-[10px] font-medium text-gray-600 truncate">
                              {c.label} ${c.amount.toFixed(0)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        {cats.map((c, ci) => {
                          const isFirst = ci === 0;
                          const isLast = ci === cats.length - 1;
                          return (
                            <div
                              key={c.key}
                              style={{
                                flex: c.amount,
                                height: "44px",
                                background: EXPENSE_STRIPES[c.idx],
                                borderRadius: isFirst && isLast ? "10px"
                                  : isFirst ? "10px 4px 4px 10px"
                                  : isLast ? "4px 10px 10px 4px"
                                  : "4px",
                              }}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
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
                                  <span className="text-[9px] text-gray-500 leading-tight truncate" title={e.project}>{e.project || "—"}</span>
                                  <span className="text-[9px] text-gray-400 leading-tight truncate" title={e.billingType}>{e.billingType || "—"}</span>
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
      <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
        {/* Employee notes */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Notes — {MONTH_NAMES[selectedMonth]} {selectedYear}
          </label>
          {monthSubmitted && !isManager ? (
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

        {/* Approval comments — editable for managers, read-only for employees */}
        {isManager && monthRecord && ["submitted", "manager_approved", "approved"].includes(monthRecord.status) ? (
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Approval Comments — {MONTH_NAMES[selectedMonth]} {selectedYear}
            </label>
            <textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="Add comments for the employee…"
              className="mt-1 w-full border border-gray-200 rounded-lg p-2.5 text-sm resize-none h-16 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleApproval("approved")}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Processing…" : "Approve Month"}
              </button>
              <button
                onClick={() => handleApproval("rejected")}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Processing…" : "Reject"}
              </button>
            </div>
          </div>
        ) : monthRecord?.manager_comments ? (
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
