/**
 * Netlify Scheduled Function: graph-sync
 *
 * Runs daily (cron: "0 2 * * *") to sync Entra ID users into the Supabase
 * profiles, user_roles, and employee_manager tables.
 *
 * Roles are derived from Entra attributes (no group membership required):
 *   - admin:   department matches ADMIN_DEPTS (IT, Technology, etc.)
 *   - finance: department matches FINANCE_DEPTS (Finance, Accounting, etc.)
 *   - manager: user has direct reports in Entra hierarchy
 *   - employee: everyone else
 *
 * Requires app permissions in Entra:
 *   - User.Read.All
 *   - Directory.Read.All
 */

import type { Config, Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { createGraphClient, fetchAllUsers, fetchUserPhoto } from "../../lib/msGraph/client";

// Department names (case-insensitive) that map to admin role
const ADMIN_DEPTS = new Set(["it", "technology", "information technology", "it department", "systems", "ict"]);
// Department names (case-insensitive) that map to finance role
const FINANCE_DEPTS = new Set(["finance", "accounting", "accounts", "financial services", "payroll"]);


export const config: Config = {
  schedule: "0 2 * * *",
};

export default async function handler(_req: Request, _context: Context) {
  const startedAt = Date.now();
  const results = { created: 0, updated: 0, errors: 0 };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const graph = createGraphClient();

  // ── Fetch all users from Graph ───────────────────────────────────────────────
  const graphUsers = await fetchAllUsers(graph);

  // ── Build set of users who have direct reports (for manager role) ───────────
  const managerSet = new Set<string>();
  for (const u of graphUsers) {
    if (u.manager?.id) managerSet.add(u.manager.id);
  }
  console.log(`[graph-sync] Fetched ${graphUsers.length} users from Entra ID`);

  // ── Get existing profiles indexed by azure_user_id and email ─────────────────
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id, azure_user_id, email");

  const existingByAzureId = new Map(
    (existingProfiles ?? [])
      .filter((p) => p.azure_user_id)
      .map((p) => [p.azure_user_id!, p.id])
  );
  const existingByEmail = new Map(
    (existingProfiles ?? [])
      .filter((p) => p.email)
      .map((p) => [p.email!.toLowerCase(), p.id])
  );

  // Build map of Graph user IDs → Supabase IDs for manager resolution
  const graphIdToSupabaseId = new Map<string, string>();
  for (const u of graphUsers) {
    const supabaseId =
      existingByAzureId.get(u.id) ?? existingByEmail.get(u.mail.toLowerCase());
    if (supabaseId) graphIdToSupabaseId.set(u.id, supabaseId);
  }

  // ── Upsert profiles + roles + manager relationships ──────────────────────────
  for (const graphUser of graphUsers) {
    try {
      const existingId =
        existingByAzureId.get(graphUser.id) ??
        existingByEmail.get(graphUser.mail.toLowerCase());

      const managerId = graphUser.manager?.id
        ? graphIdToSupabaseId.get(graphUser.manager.id) ?? null
        : null;

      let profileId = existingId;

      if (!profileId) {
        // Pre-provision: create auth user via Admin API
        if (!graphUser.mail) {
          console.warn("[graph-sync] Skipping user without email:", graphUser.displayName);
          continue;
        }

        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: graphUser.mail,
          email_confirm: true,
          user_metadata: {
            full_name: graphUser.displayName,
            azure_user_id: graphUser.id,
          },
        });

        if (createErr) {
          // User may already exist in auth but not matched in profiles
          const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
          const match = (authUsers ?? []).find(
            (u) => u.email?.toLowerCase() === graphUser.mail.toLowerCase()
          );
          if (match) {
            profileId = match.id;
          } else {
            results.errors++;
            console.error("[graph-sync] Failed to create user:", graphUser.mail, createErr.message);
            continue;
          }
        } else {
          profileId = newUser.user.id;
        }

        // Ensure profile row exists (handle_new_user trigger may have a delay)
        await supabase.from("profiles").upsert({
          id: profileId,
          email: graphUser.mail,
          display_name: graphUser.displayName,
          azure_user_id: graphUser.id,
          job_title: graphUser.jobTitle ?? null,
          department: graphUser.department ?? null,
        } as any, { onConflict: "id" });

        graphIdToSupabaseId.set(graphUser.id, profileId);
        results.created++;
      } else {
        // Update existing profile metadata
        const { error } = await supabase
          .from("profiles")
          .update({
            display_name: graphUser.displayName,
            email: graphUser.mail,
            azure_user_id: graphUser.id,
            job_title: graphUser.jobTitle ?? null,
            department: graphUser.department ?? null,
          })
          .eq("id", profileId);

        if (error) {
          results.errors++;
          console.error("[graph-sync] profile update error:", error);
          continue;
        }
        results.updated++;
      }

      // Sync roles: wipe existing, insert fresh from Entra attributes
      await supabase.from("user_roles").delete().eq("user_id", profileId);
      const rolesToInsert: Array<{ user_id: string; role: string }> = [];
      const dept = (graphUser.department ?? "").toLowerCase().trim();
      if (ADMIN_DEPTS.has(dept)) rolesToInsert.push({ user_id: profileId, role: "admin" });
      if (FINANCE_DEPTS.has(dept)) rolesToInsert.push({ user_id: profileId, role: "finance" });
      if (managerSet.has(graphUser.id)) rolesToInsert.push({ user_id: profileId, role: "manager" });
      if (rolesToInsert.length === 0) rolesToInsert.push({ user_id: profileId, role: "employee" });
      await supabase.from("user_roles").insert(rolesToInsert as any);

      // Sync manager relationship
      if (managerId) {
        await supabase
          .from("employee_manager")
          .upsert({ employee_id: profileId, manager_id: managerId }, {
            onConflict: "employee_id",
          });
      } else {
        await supabase.from("employee_manager").delete().eq("employee_id", profileId);
      }
    } catch (err) {
      results.errors++;
      console.error("[graph-sync] error processing user:", graphUser.mail, err);
    }
  }

  // ── Sync profile photos from Entra ──────────────────────────────────────────
  let photosSynced = 0;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // Reload profiles to check which need photos
  const { data: profilesForPhotos } = await supabase
    .from("profiles")
    .select("id, azure_user_id, avatar_url");

  const needsPhoto = (profilesForPhotos ?? []).filter(
    (p) => p.azure_user_id && !p.avatar_url
  );

  for (const profile of needsPhoto) {
    try {
      const photoData = await fetchUserPhoto(graph, profile.azure_user_id!);
      if (!photoData) continue;

      const path = `${profile.id}/avatar.jpg`;
      const blob = new Blob([photoData], { type: "image/jpeg" });

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (uploadErr) continue;

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl } as any)
        .eq("id", profile.id);

      photosSynced++;
    } catch {
      // Non-fatal: skip photo
    }
  }

  const elapsed = Date.now() - startedAt;
  console.log(`[graph-sync] Done in ${elapsed}ms:`, { ...results, photosSynced });

  return new Response(
    JSON.stringify({ ok: true, elapsed, ...results, photosSynced }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
