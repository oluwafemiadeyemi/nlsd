/**
 * GET /api/admin/directory-sync/status
 * Authorization: Bearer <supabase_access_token>
 *
 * Returns the 30 most recent directory sync run records.
 * Accessible to admin and finance roles.
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

    const { data, error } = await db
      .from("directory_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, runs: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load sync status" }, { status: 500 });
  }
}
