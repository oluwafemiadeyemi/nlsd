/**
 * POST /api/admin/auto-manager-roles?keepAdminAsManager=true
 * Authorization: Bearer <supabase_access_token>
 *
 * Grants the 'manager' role to every user who has >=1 direct report in
 * employee_manager, and removes it from users who have none
 * (unless they are also admin and keepAdminAsManager=true).
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

    const keepAdminAsManager =
      (req.nextUrl.searchParams.get("keepAdminAsManager") ?? "true") === "true";

    const db = supabaseAdmin();

    // Who has >=1 direct report?
    const { data: emRows, error: emErr } = await db
      .from("employee_manager")
      .select("manager_id, employee_id");
    if (emErr) return NextResponse.json({ error: emErr.message }, { status: 400 });

    const reportCountByManager = new Map<string, number>();
    for (const row of emRows ?? []) {
      if (!row.manager_id) continue;
      reportCountByManager.set(row.manager_id, (reportCountByManager.get(row.manager_id) ?? 0) + 1);
    }
    const managersByOrg = new Set(reportCountByManager.keys());

    // Existing manager role holders
    const { data: existingManagerRoles, error: existingErr } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", "manager");
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 400 });

    const existingManagers = new Set((existingManagerRoles ?? []).map((r) => r.user_id as string));

    // Optionally protect admins from losing their manager role
    const adminIds = new Set<string>();
    if (keepAdminAsManager) {
      const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins ?? []) adminIds.add(a.user_id as string);
    }

    // Compute adds / removes
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
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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

    return NextResponse.json({ ok: true, added: toAdd.length, removed });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to auto-assign manager roles" }, { status: 500 });
  }
}
