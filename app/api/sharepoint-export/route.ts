/**
 * POST /api/sharepoint-export
 * Body: { type: "timesheet" | "expense", id: string }
 * Header: x-workhub-secret: <GRAPH_SYNC_SECRET>
 *
 * Exports an approved timesheet or expense report to SharePoint as CSV.
 * Idempotent: uses a stable idempotency_key to prevent double-exports.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createGraphClient, uploadToSharePoint } from "@/lib/msGraph/client";
import { getAppConfig } from "@/lib/config/appConfig";
import { timingSafeEqual } from "crypto";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-workhub-secret") ?? "";
  const expected = process.env.GRAPH_SYNC_SECRET ?? "";
  if (!secret || !expected || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id } = (await req.json()) as { type: "timesheet" | "expense"; id: string };
  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables: " +
      [!supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL", !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"]
        .filter(Boolean).join(", ")
    );
  }

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { persistSession: false } }
  );

  const idempotencyKey = `${type}-${id}`;

  // Check idempotency — already exported?
  const { data: existing } = await supabase
    .from("sharepoint_sync")
    .select("id, last_status, last_synced_at")
    .eq("sync_key", idempotencyKey)
    .single();

  if (existing?.last_status === "success") {
    return NextResponse.json({ ok: true, skipped: true, sync_key: idempotencyKey, ...existing });
  }

  // Create or update pending log entry
  await supabase
    .from("sharepoint_sync")
    .upsert({
      entity_type: type === "timesheet" ? "timesheet" : "expense_report",
      entity_id: id,
      sync_key: idempotencyKey,
      last_status: null,
      last_error: null,
    } as any, { onConflict: "sync_key" });

  try {
    let csvContent: string;
    let filename: string;

    if (type === "timesheet") {
      ({ csvContent, filename } = await buildTimesheetCsv(supabase, id));
    } else {
      ({ csvContent, filename } = await buildExpenseCsv(supabase, id));
    }

    const appConfig = await getAppConfig();
    const graph = await createGraphClient(appConfig);
    const { id: spItemId } = await uploadToSharePoint(
      graph,
      appConfig.sharepointSiteId,
      appConfig.sharepointDriveId,
      appConfig.sharepointPayrollFolder || "Payroll/Exports",
      filename,
      csvContent
    );

    await supabase
      .from("sharepoint_sync")
      .update({
        last_status: "success",
        last_synced_at: new Date().toISOString(),
        last_error: null,
      } as any)
      .eq("sync_key", idempotencyKey);

    return NextResponse.json({ ok: true, filename, sharepointItemId: spItemId });
  } catch (err: any) {
    await supabase
      .from("sharepoint_sync")
      .update({ last_status: "failed", last_error: err.message } as any)
      .eq("sync_key", idempotencyKey);

    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// ─── CSV Builders ─────────────────────────────────────────────────────────────

async function buildTimesheetCsv(supabase: any, id: string) {
  const { data: ts } = await supabase
    .from("timesheets")
    .select(`
      *,
      employee:profiles!employee_id(display_name, email, department),
      timesheet_rows (
        *,
        project:projects!project_id(code, title),
        billing_type:billing_types!billing_type_id(name)
      )
    `)
    .eq("id", id)
    .single();

  if (!ts) throw new Error(`Timesheet ${id} not found`);

  const t = ts as any;
  const filename = `timesheet_${t.employee.email.replace("@", "_at_")}_${t.year}_m${t.month}_w${t.week_number}.csv`;

  const headers = [
    "Employee Email", "Employee Name", "Department",
    "Year", "Month", "Week",
    "Project Code", "Project Title", "Billing Type",
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Total",
    "Status", "Submitted At", "Approved At",
  ];

  const rows = (t.timesheet_rows ?? []).map((r: any) => {
    const total = (r.sun ?? 0) + (r.mon ?? 0) + (r.tue ?? 0) + (r.wed ?? 0) +
      (r.thu ?? 0) + (r.fri ?? 0) + (r.sat ?? 0);
    return [
      t.employee.email,
      t.employee.display_name,
      t.employee.department ?? "",
      t.year,
      t.month,
      t.week_number,
      r.project?.code ?? "",
      r.project?.title ?? "",
      r.billing_type?.name ?? "",
      r.sun ?? 0,
      r.mon ?? 0,
      r.tue ?? 0,
      r.wed ?? 0,
      r.thu ?? 0,
      r.fri ?? 0,
      r.sat ?? 0,
      total.toFixed(2),
      t.status,
      t.submitted_at ?? "",
      t.approved_at ?? "",
    ];
  });

  const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csvContent, filename };
}

async function buildExpenseCsv(supabase: any, id: string) {
  const { data: report } = await supabase
    .from("expense_reports")
    .select(`
      *,
      employee:profiles!employee_id(display_name, email, department),
      expense_entries(*)
    `)
    .eq("id", id)
    .single();

  if (!report) throw new Error(`Expense report ${id} not found`);

  const r = report as any;

  const weekBeginning = r.week_beginning_date ?? "";
  const filename = `expenses_${r.employee.email.replace("@", "_at_")}_${weekBeginning}.csv`;

  const headers = [
    "Employee Email", "Employee Name", "Department",
    "Year", "Month", "Week", "Week Beginning", "Destination",
    "Day", "Mileage KM", "Mileage Cost",
    "Lodging", "Breakfast", "Lunch", "Dinner", "Other",
    "Daily Total", "Travel From", "Travel To", "Notes",
    "Status", "Submitted At", "Approved At",
  ];

  const rows = (r.expense_entries ?? [])
    .sort((a: any, b: any) => a.day_index - b.day_index)
    .map((entry: any) => {
      const dailyTotal =
        (entry.mileage_cost ?? 0) +
        (entry.lodging_amount ?? 0) +
        (entry.breakfast_amount ?? 0) +
        (entry.lunch_amount ?? 0) +
        (entry.dinner_amount ?? 0) +
        (entry.other_amount ?? 0);
      return [
        r.employee.email,
        r.employee.display_name,
        r.employee.department ?? "",
        r.year,
        r.month,
        r.week_number,
        weekBeginning,
        r.destination ?? "",
        DAY_NAMES[entry.day_index] ?? entry.day_index,
        entry.mileage_km ?? 0,
        entry.mileage_cost ?? 0,
        entry.lodging_amount ?? 0,
        entry.breakfast_amount ?? 0,
        entry.lunch_amount ?? 0,
        entry.dinner_amount ?? 0,
        entry.other_amount ?? 0,
        dailyTotal.toFixed(2),
        entry.travel_from ?? "",
        entry.travel_to ?? "",
        entry.notes ?? "",
        r.status,
        r.submitted_at ?? "",
        r.approved_at ?? "",
      ];
    });

  const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csvContent, filename };
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
