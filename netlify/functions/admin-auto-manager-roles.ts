/**
 * Netlify Function: admin-auto-manager-roles
 *
 * POST /api/admin/auto-manager-roles?keepAdminAsManager=true
 * Authorization: Bearer <supabase_access_token>
 *
 * Grants the 'manager' role to every user who has ≥1 direct report in
 * employee_manager, and removes it from users who have none
 * (unless they are also admin and keepAdminAsManager=true).
 */

import type { Context } from "@netlify/functions";
import { json, getBearerToken, requireMethod } from "./_lib/http";
import { supabaseAdmin, supabaseUser } from "./_lib/supabase";
import { writeAudit } from "./_lib/audit";

export default async function handler(req: Request, _context: Context) {
  const methodErr = requireMethod(req, "POST");
  if (methodErr) return methodErr;

  try {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Bearer token" });

    const userDb = supabaseUser(token);
    const { data: roleRows } = await userDb.from("user_roles").select("role").eq("role", "admin").limit(1);
    if (!roleRows || roleRows.length === 0) return json(403, { error: "Admin role required" });

    const keepAdminAsManager =
      (new URL(req.url).searchParams.get("keepAdminAsManager") ?? "true") === "true";

    const db = supabaseAdmin();

    // 1) Who has ≥1 direct report?
    const { data: emRows, error: emErr } = await db
      .from("employee_manager")
      .select("manager_id, employee_id");
    if (emErr) return json(400, { error: emErr.message });

    const reportCountByManager = new Map<string, number>();
    for (const row of emRows ?? []) {
      if (!row.manager_id) continue;
      reportCountByManager.set(row.manager_id, (reportCountByManager.get(row.manager_id) ?? 0) + 1);
    }
    const managersByOrg = new Set(reportCountByManager.keys());

    // 2) Existing manager role holders
    const { data: existingManagerRoles, error: existingErr } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", "manager");
    if (existingErr) return json(400, { error: existingErr.message });

    const existingManagers = new Set((existingManagerRoles ?? []).map((r) => r.user_id as string));

    // 3) Optionally protect admins from losing their manager role
    const adminIds = new Set<string>();
    if (keepAdminAsManager) {
      const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins ?? []) adminIds.add(a.user_id as string);
    }

    // 4) Compute adds / removes
    const toAdd = Array.from(managersByOrg).filter((id) => !existingManagers.has(id));
    const toRemove = Array.from(existingManagers).filter(
      (id) => !managersByOrg.has(id) && !adminIds.has(id)
    );

    if (toAdd.length) {
      const { error } = await db
        .from("user_roles")
        .upsert(
          toAdd.map((id) => ({ user_id: id, role: "manager" })),
          { onConflict: "user_id,role" }
        );
      if (error) return json(400, { error: error.message });
    }

    let removed = 0;
    for (const id of toRemove) {
      const { error } = await db.from("user_roles").delete().eq("user_id", id).eq("role", "manager");
      if (!error) removed++;
    }

    await writeAudit({
      actorUserId: null,
      entityType: "directory_sync",
      entityId: null,
      action: "update",
      comment: `Auto-manager roles: added=${toAdd.length}, removed=${removed}, keepAdminAsManager=${keepAdminAsManager}`,
      afterJson: { added: toAdd.length, removed },
    });

    return json(200, { ok: true, added: toAdd.length, removed });
  } catch (err: any) {
    return json(500, { error: err?.message ?? "Failed to auto-assign manager roles" });
  }
}
