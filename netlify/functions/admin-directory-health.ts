/**
 * Netlify Function: admin-directory-health
 *
 * GET /api/admin/directory-health?limit=50
 * Authorization: Bearer <supabase_access_token>
 *
 * Returns directory health metrics and issue lists for the admin dashboard.
 */

import type { Context } from "@netlify/functions";
import { json, getBearerToken } from "./_lib/http";
import { supabaseUser } from "./_lib/supabase";

export default async function handler(req: Request, _context: Context) {
  try {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Bearer token" });

    const db = supabaseUser(token);

    const { data: roles } = await db
      .from("user_roles")
      .select("role")
      .in("role", ["admin", "finance"]);
    if (!roles || roles.length === 0) {
      return json(403, { error: "Admin or Finance role required" });
    }

    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? "50"), 200);

    const [metricsRes, missingIdentityRes, missingManagerRes, dupEmpNoRes, mgrNoRoleRes] =
      await Promise.all([
        db.from("v_directory_health_metrics").select("*").single(),
        db.from("v_directory_missing_identity").select("*").order("updated_at", { ascending: false }).limit(limit),
        db.from("v_directory_missing_manager").select("*").order("updated_at", { ascending: false }).limit(limit),
        db.from("v_directory_duplicate_employee_number").select("*").order("occurrences", { ascending: false }).limit(limit),
        db.from("v_directory_managers_without_role").select("*").order("direct_reports_count", { ascending: false }).limit(limit),
      ]);

    if (metricsRes.error) return json(400, { error: metricsRes.error.message });

    return json(200, {
      ok: true,
      metrics: metricsRes.data,
      lists: {
        missingIdentity: missingIdentityRes.data ?? [],
        missingManager: missingManagerRes.data ?? [],
        duplicateEmployeeNumber: dupEmpNoRes.data ?? [],
        managersWithoutRole: mgrNoRoleRes.data ?? [],
      },
    });
  } catch (err: any) {
    return json(500, { error: err?.message ?? "Failed to load directory health" });
  }
}
