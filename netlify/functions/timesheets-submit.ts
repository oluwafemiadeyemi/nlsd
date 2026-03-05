import type { Config, Context } from "@netlify/functions";
import { json, getBearerToken, requireMethod } from "./_lib/http";
import { supabaseAdmin, supabaseUser, getUserIdFromJwt } from "./_lib/supabase";
import { writeAudit } from "./_lib/audit";
import { assertCanSubmit } from "./_lib/workflow";

export const config: Config = { path: "/api/timesheets/:id/submit" };

export default async function handler(req: Request, context: Context): Promise<Response> {
  const methodError = requireMethod(req, "POST");
  if (methodError) return methodError;

  try {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Bearer token" });

    const timesheetId = context.params?.id ?? (await req.json().then((b) => b?.timesheetId).catch(() => null));
    if (!timesheetId) return json(400, { error: "Missing timesheetId" });

    const userDb = supabaseUser(token);
    const { data: t, error: tErr } = await userDb
      .from("timesheets")
      .select("id, employee_id, manager_id, status")
      .eq("id", timesheetId)
      .single();

    if (tErr || !t) return json(404, { error: "Timesheet not found" });

    assertCanSubmit(t.status as any);

    const adminDb = supabaseAdmin();

    // Resolve manager if not set
    let managerId = t.manager_id as string | null;
    if (!managerId) {
      const { data: em } = await adminDb
        .from("employee_manager")
        .select("manager_id")
        .eq("employee_id", t.employee_id)
        .single();
      managerId = em?.manager_id ?? null;
    }

    const { data: updated, error: uErr } = await adminDb
      .from("timesheets")
      .update({
        status: "submitted",
        manager_id: managerId,
        submitted_at: new Date().toISOString(),
        rejected_at: null,
        approved_at: null,
      })
      .eq("id", timesheetId)
      .select()
      .single();

    if (uErr) return json(400, { error: uErr.message });

    await writeAudit({
      actorUserId: t.employee_id,
      entityType: "timesheet",
      entityId: timesheetId,
      action: "submit",
      beforeJson: t,
      afterJson: updated,
    });

    return json(200, { ok: true, timesheet: updated });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "Unknown error" });
  }
}
