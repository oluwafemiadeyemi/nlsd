/**
 * GET /api/admin/directory-health?limit=50
 * Authorization: Bearer <supabase_access_token>
 *
 * Returns directory health metrics and issue lists for the admin dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/server/http";
import { supabaseUser } from "@/lib/server/supabase";

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const db = supabaseUser(token);

    const { data: roles } = await db
      .from("user_roles")
      .select("role")
      .in("role", ["admin", "finance"]);
    if (!roles || roles.length === 0) {
      return NextResponse.json({ error: "Admin or Finance role required" }, { status: 403 });
    }

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);

    const [metricsRes, missingIdentityRes, missingManagerRes, dupEmpNoRes, mgrNoRoleRes] =
      await Promise.all([
        db.from("v_directory_health_metrics").select("*").single(),
        db.from("v_directory_missing_identity").select("*").order("updated_at", { ascending: false }).limit(limit),
        db.from("v_directory_missing_manager").select("*").order("updated_at", { ascending: false }).limit(limit),
        db.from("v_directory_duplicate_employee_number").select("*").order("occurrences", { ascending: false }).limit(limit),
        db.from("v_directory_managers_without_role").select("*").order("direct_reports_count", { ascending: false }).limit(limit),
      ]);

    if (metricsRes.error) return NextResponse.json({ error: metricsRes.error.message }, { status: 400 });

    return NextResponse.json({
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
    return NextResponse.json({ error: err?.message ?? "Failed to load directory health" }, { status: 500 });
  }
}
