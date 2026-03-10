/**
 * POST /api/admin/reroute-submitted-approvals?override=false
 * Authorization: Bearer <supabase_access_token>
 *
 * Re-routes submitted timesheets and expense reports to the correct manager
 * based on the current employee_manager mapping.
 *
 * override=false (default): only updates records where manager_id is null/empty
 * override=true: updates all submitted records to the current manager
 *
 * Never touches approved/rejected records to preserve audit integrity.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/server/http";
import { supabaseAdmin, supabaseUser } from "@/lib/server/supabase";
import { writeAudit } from "@/lib/server/audit";

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const userDb = supabaseUser(token);
    const { data: roleRows } = await userDb.from("user_roles").select("role").eq("role", "admin").limit(1);
    if (!roleRows || roleRows.length === 0) return NextResponse.json({ error: "Admin role required" }, { status: 403 });

    const overrideExisting =
      (req.nextUrl.searchParams.get("override") ?? "false") === "true";

    const db = supabaseAdmin();

    // Load employee→manager mapping
    const { data: mapRows, error: mapErr } = await db
      .from("employee_manager")
      .select("employee_id, manager_id");
    if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 400 });

    const managerByEmployee = new Map<string, string | null>();
    for (const r of mapRows ?? []) managerByEmployee.set(r.employee_id, r.manager_id);

    // Re-route submitted timesheets
    const { data: ts, error: tsErr } = await db
      .from("timesheets")
      .select("id, employee_id, manager_id")
      .eq("status", "submitted");
    if (tsErr) return NextResponse.json({ error: tsErr.message }, { status: 400 });

    let timesheetsRerouted = 0;
    for (const t of ts ?? []) {
      const correct = managerByEmployee.get(t.employee_id as string) ?? null;
      const needsUpdate = overrideExisting
        ? correct !== (t.manager_id ?? null)
        : !(t.manager_id) && !!correct;
      if (!needsUpdate) continue;
      const { error } = await db.from("timesheets").update({ manager_id: correct } as any).eq("id", t.id);
      if (!error) timesheetsRerouted++;
    }

    // Re-route submitted expense reports
    const { data: ex, error: exErr } = await db
      .from("expense_reports")
      .select("id, employee_id, manager_id")
      .eq("status", "submitted");
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 });

    let expensesRerouted = 0;
    for (const r of ex ?? []) {
      const correct = managerByEmployee.get(r.employee_id as string) ?? null;
      const needsUpdate = overrideExisting
        ? correct !== (r.manager_id ?? null)
        : !(r.manager_id) && !!correct;
      if (!needsUpdate) continue;
      const { error } = await db.from("expense_reports").update({ manager_id: correct } as any).eq("id", r.id);
      if (!error) expensesRerouted++;
    }

    await writeAudit({
      actorUserId: null,
      entityType: "directory_sync",
      entityId: null,
      action: "update",
      comment: `Rerouted submitted approvals. Timesheets=${timesheetsRerouted}, Expenses=${expensesRerouted}, override=${overrideExisting}`,
    });

    return NextResponse.json({
      ok: true,
      overrideExisting,
      timesheetsRerouted,
      expensesRerouted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to reroute submissions" }, { status: 500 });
  }
}
