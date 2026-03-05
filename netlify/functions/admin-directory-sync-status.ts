/**
 * Netlify Function: admin-directory-sync-status
 *
 * GET /api/admin/directory-sync-status
 * Authorization: Bearer <supabase_access_token>
 *
 * Returns the 30 most recent directory sync run records.
 * Accessible to admin and finance roles.
 */

import type { Context } from "@netlify/functions";
import { json, getBearerToken } from "./_lib/http";
import { supabaseUser } from "./_lib/supabase";

export default async function handler(req: Request, _context: Context) {
  try {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Bearer token" });

    const db = supabaseUser(token);

    // Admin or finance can view
    const { data: roles } = await db
      .from("user_roles")
      .select("role")
      .in("role", ["admin", "finance"]);
    if (!roles || roles.length === 0) {
      return json(403, { error: "Admin or Finance role required" });
    }

    const { data, error } = await db
      .from("directory_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);

    if (error) return json(400, { error: error.message });
    return json(200, { ok: true, runs: data ?? [] });
  } catch (err: any) {
    return json(500, { error: err?.message ?? "Failed to load sync status" });
  }
}
