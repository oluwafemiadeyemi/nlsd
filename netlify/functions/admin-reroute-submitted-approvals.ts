/**
 * Netlify Function: admin-reroute-submitted-approvals
 *
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

import type { Context } from "@netlify/functions";
import { json, getBearerToken, requireMethod } from "./_lib/http";
import { supabaseAdmin, supabaseUser } from "./_lib/supabase";
import { writeAudit } from "./_lib/audit";

// No config.path — accessible at /.netlify/functions/admin-reroute-submitted-approvals

export default async function handler(req: Request, _context: Context) {
  const methodErr = requireMethod(req, "POST");
  if (methodErr) return methodErr;

  try {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Bearer token" });

    const userDb = supabaseUser(token);
    const { data: roleRows } = await userDb.from("user_roles").select("role").eq("role", "admin").limit(1);
    if (!roleRows || roleRows.length === 0) return json(403, { error: "Admin role required" });

    const overrideExisting =
      (new URL(req.url).searchParams.get("override") ?? "false") === "true";

    const db = supabaseAdmin();

    // Load employee→manager mapping
    const { data: mapRows, error: mapErr } = await db
      .from("employee_manager")
      .select("employee_id, manager_id");
    if (mapErr) return json(400, { error: mapErr.message });

    const managerByEmployee = new Map<string, string | null>();
    for (const r of mapRows ?? []) managerByEmployee.set(r.employee_id, r.manager_id);

    // Re-route submitted timesheets
    const { data: ts, error: tsErr } = await db
      .from("timesheets")
      .select("id, employee_id, manager_id")
      .eq("status", "submitted");
    if (tsErr) return json(400, { error: tsErr.message });

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
    if (exErr) return json(400, { error: exErr.message });

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

    return json(200, {
      ok: true,
      overrideExisting,
      timesheetsRerouted,
      expensesRerouted,
    });
  } catch (err: any) {
    return json(500, { error: err?.message ?? "Failed to reroute submissions" });
  }
}
