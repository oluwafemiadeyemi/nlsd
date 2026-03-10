import { supabaseAdmin } from "../supabase";
import { uploadCsvToSharePoint } from "./upload";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Timesheet sync ───────────────────────────────────────────────────────────

export async function syncTimesheetToSharePoint(timesheetId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: t, error: tErr } = await db
    .from("timesheets")
    .select("id, employee_id, year, month, week_number, status, submitted_at, approved_at")
    .eq("id", timesheetId)
    .single();

  if (tErr || !t) throw new Error("Timesheet not found for sync");
  if (t.status !== "approved") throw new Error("Only approved timesheets can be synced");

  const { data: profile } = await db
    .from("profiles")
    .select("id, email, display_name, department")
    .eq("id", t.employee_id)
    .single();

  const { data: rows } = await db
    .from("timesheet_rows")
    .select(`
      billing_type_id, project_id, sun, mon, tue, wed, thu, fri, sat,
      project:projects!project_id(code, title),
      billing_type:billing_types!billing_type_id(name)
    `)
    .eq("timesheet_id", timesheetId);

  const csvRows = (rows ?? []).map((r: any) => ({
    timesheet_id: t.id,
    employee_id: profile?.id ?? "",
    employee_email: profile?.email ?? "",
    employee_name: profile?.display_name ?? "",
    department: profile?.department ?? "",
    year: t.year,
    month: t.month,
    week_number: t.week_number,
    project_code: r.project?.code ?? "",
    project_title: r.project?.title ?? "",
    billing_type: r.billing_type?.name ?? "",
    sun: r.sun ?? 0,
    mon: r.mon ?? 0,
    tue: r.tue ?? 0,
    wed: r.wed ?? 0,
    thu: r.thu ?? 0,
    fri: r.fri ?? 0,
    sat: r.sat ?? 0,
    weekly_total: ((r.sun ?? 0) + (r.mon ?? 0) + (r.tue ?? 0) + (r.wed ?? 0) + (r.thu ?? 0) + (r.fri ?? 0) + (r.sat ?? 0)).toFixed(2),
    submitted_at: t.submitted_at ?? "",
    approved_at: t.approved_at ?? "",
  }));

  const monthStr = String(t.month).padStart(2, "0");
  const filename = `timesheet_${profile?.id}_${t.year}_${monthStr}_wk${t.week_number}.csv`;
  const path = `Payroll/Timesheets/${t.year}/${monthStr}/${filename}`;

  const { id: sharepointItemId } = await uploadCsvToSharePoint({ path, csvContent: toCsv(csvRows) });

  // Record in sharepoint_sync
  await db.from("sharepoint_sync").upsert({
    entity_type: "timesheet",
    entity_id: t.id,
    sync_key: `timesheet-${t.id}`,
    last_status: "success",
    last_synced_at: new Date().toISOString(),
    last_error: null,
  } as any, { onConflict: "sync_key" });
}

// ─── Expense report sync ──────────────────────────────────────────────────────

export async function syncExpenseReportToSharePoint(reportId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: r, error: rErr } = await db
    .from("expense_reports")
    .select("id, employee_id, year, week_number, week_beginning_date, destination, status, submitted_at, approved_at")
    .eq("id", reportId)
    .single();

  if (rErr || !r) throw new Error("Expense report not found for sync");
  if (r.status !== "approved") throw new Error("Only approved expense reports can be synced");

  const { data: profile } = await db
    .from("profiles")
    .select("id, email, display_name, department")
    .eq("id", r.employee_id)
    .single();

  const { data: entries } = await db
    .from("expense_entries")
    .select("day_index, mileage_km, mileage_cost, lodging_amount, breakfast_amount, lunch_amount, dinner_amount, other_amount, travel_from, travel_to, notes")
    .eq("report_id", reportId)
    .order("day_index");

  const csvRows = (entries ?? []).map((e: any) => {
    const daily =
      (e.mileage_cost ?? 0) +
      (e.lodging_amount ?? 0) +
      (e.breakfast_amount ?? 0) +
      (e.lunch_amount ?? 0) +
      (e.dinner_amount ?? 0) +
      (e.other_amount ?? 0);
    return {
      report_id: r.id,
      employee_id: profile?.id ?? "",
      employee_email: profile?.email ?? "",
      employee_name: profile?.display_name ?? "",
      department: profile?.department ?? "",
      year: r.year,
      week_number: r.week_number,
      week_beginning: r.week_beginning_date ?? "",
      destination: r.destination ?? "",
      day: DAY_NAMES[e.day_index] ?? e.day_index,
      mileage_km: e.mileage_km ?? 0,
      mileage_cost: e.mileage_cost ?? 0,
      lodging: e.lodging_amount ?? 0,
      breakfast: e.breakfast_amount ?? 0,
      lunch: e.lunch_amount ?? 0,
      dinner: e.dinner_amount ?? 0,
      other: e.other_amount ?? 0,
      daily_total: daily.toFixed(2),
      travel_from: e.travel_from ?? "",
      travel_to: e.travel_to ?? "",
      notes: e.notes ?? "",
      submitted_at: r.submitted_at ?? "",
      approved_at: r.approved_at ?? "",
    };
  });

  const weekBeginning = r.week_beginning_date ?? `${r.year}-wk${r.week_number}`;
  const filename = `expenses_${profile?.id}_${weekBeginning}.csv`;
  const path = `Payroll/Expenses/${r.year}/${filename}`;

  const { id: sharepointItemId } = await uploadCsvToSharePoint({ path, csvContent: toCsv(csvRows) });

  await db.from("sharepoint_sync").upsert({
    entity_type: "expense_report",
    entity_id: r.id,
    sync_key: `expense-${r.id}`,
    last_status: "success",
    last_synced_at: new Date().toISOString(),
    last_error: null,
  } as any, { onConflict: "sync_key" });
}
