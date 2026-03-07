/**
 * Netlify Scheduled Function: graph-sync
 *
 * Runs daily (cron: "0 2 * * *") to sync Entra ID users and group memberships
 * into the Supabase profiles, user_roles, and employee_manager tables.
 *
 * Requires app permissions in Entra:
 *   - User.Read.All
 *   - Group.Read.All
 *   - Directory.Read.All
 */

import type { Config, Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { createGraphClient, fetchAllUsers, fetchGroupMembers, fetchUserPhoto } from "../../lib/msGraph/client";


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

  // ── Fetch role group memberships ────────────────────────────────────────────
  const [adminIds, managerIds, financeIds] = await Promise.all([
    fetchGroupMembers(graph, process.env.AZURE_GROUP_ADMINS!).catch(() => []),
    fetchGroupMembers(graph, process.env.AZURE_GROUP_MANAGERS!).catch(() => []),
    fetchGroupMembers(graph, process.env.AZURE_GROUP_FINANCE ?? "").catch(() => []),
  ]);

  const adminSet = new Set(adminIds);
  const managerSet = new Set(managerIds);
  const financeSet = new Set(financeIds);

  // ── Fetch all users from Graph ───────────────────────────────────────────────
  const graphUsers = await fetchAllUsers(graph);
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

  // ── Resolve profile IDs + provision new users ───────────────────────────────
  for (const graphUser of graphUsers) {
    try {
      const existingId =
        existingByAzureId.get(graphUser.id) ??
        existingByEmail.get(graphUser.mail.toLowerCase());

      if (!existingId) {
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

        let profileId: string;
        if (createErr) {
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

        graphIdToSupabaseId.set(graphUser.id, profileId);
        results.created++;
      } else {
        graphIdToSupabaseId.set(graphUser.id, existingId);
        results.updated++;
      }
    } catch (err) {
      results.errors++;
      console.error("[graph-sync] error provisioning user:", graphUser.mail, err);
    }
  }

  // ── Batch upsert all profiles ──────────────────────────────────────────────
  const profileUpserts = graphUsers
    .filter((u) => u.mail && graphIdToSupabaseId.has(u.id))
    .map((u) => ({
      id: graphIdToSupabaseId.get(u.id)!,
      email: u.mail,
      display_name: u.displayName,
      azure_user_id: u.id,
      job_title: u.jobTitle ?? null,
      department: u.department ?? null,
    }));

  if (profileUpserts.length) {
    const { error } = await supabase.from("profiles").upsert(profileUpserts as any, { onConflict: "id" });
    if (error) console.error("[graph-sync] batch profile upsert error:", error);
  }

  // ── Batch upsert roles ─────────────────────────────────────────────────────
  const allRoleRows: Array<{ user_id: string; role: string }> = [];
  const profileIdsToSync = new Set<string>();

  for (const graphUser of graphUsers) {
    const profileId = graphIdToSupabaseId.get(graphUser.id);
    if (!profileId) continue;
    profileIdsToSync.add(profileId);

    const roles: string[] = [];
    if (adminSet.has(graphUser.id)) roles.push("admin");
    if (managerSet.has(graphUser.id)) roles.push("manager");
    if (financeSet.has(graphUser.id)) roles.push("finance");
    if (roles.length === 0) roles.push("employee");
    for (const role of roles) allRoleRows.push({ user_id: profileId, role });
  }

  // Delete existing roles for synced users, then insert fresh
  if (profileIdsToSync.size) {
    await supabase.from("user_roles").delete().in("user_id", [...profileIdsToSync]);
  }
  if (allRoleRows.length) {
    const { error } = await supabase.from("user_roles").insert(allRoleRows as any);
    if (error) console.error("[graph-sync] batch role insert error:", error);
  }

  // ── Batch upsert manager relationships ─────────────────────────────────────
  const managerUpserts: Array<{ employee_id: string; manager_id: string }> = [];
  const noManagerIds: string[] = [];

  for (const graphUser of graphUsers) {
    const profileId = graphIdToSupabaseId.get(graphUser.id);
    if (!profileId) continue;

    const managerId = graphUser.manager?.id
      ? graphIdToSupabaseId.get(graphUser.manager.id) ?? null
      : null;

    if (managerId) {
      managerUpserts.push({ employee_id: profileId, manager_id: managerId });
    } else {
      noManagerIds.push(profileId);
    }
  }

  if (managerUpserts.length) {
    const { error } = await supabase
      .from("employee_manager")
      .upsert(managerUpserts, { onConflict: "employee_id" });
    if (error) console.error("[graph-sync] batch manager upsert error:", error);
  }
  if (noManagerIds.length) {
    await supabase.from("employee_manager").delete().in("employee_id", noManagerIds);
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

  // Process photos in parallel batches of 5
  const PHOTO_CONCURRENCY = 5;
  for (let i = 0; i < needsPhoto.length; i += PHOTO_CONCURRENCY) {
    const batch = needsPhoto.slice(i, i + PHOTO_CONCURRENCY);
    const results2 = await Promise.allSettled(
      batch.map(async (profile) => {
        const photoData = await fetchUserPhoto(graph, profile.azure_user_id!);
        if (!photoData) return false;

        const path = `${profile.id}/avatar.jpg`;
        const blob = new Blob([photoData], { type: "image/jpeg" });

        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (uploadErr) return false;

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
        await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl } as any)
          .eq("id", profile.id);

        return true;
      })
    );
    photosSynced += results2.filter((r) => r.status === "fulfilled" && r.value).length;
  }

  // ── Audit log ────────────────────────────────────────────────────────────────
  try {
    await supabase.from("audit_log").insert({
      entity_type: "directory_sync",
      action: "sync_success",
      comment: `Created=${results.created}, Updated=${results.updated}, Errors=${results.errors}, Photos=${photosSynced}, Roles=${allRoleRows.length}, Managers=${managerUpserts.length}`,
    } as any);
  } catch { /* non-fatal */ }

  const elapsed = Date.now() - startedAt;
  console.log(`[graph-sync] Done in ${elapsed}ms:`, { ...results, photosSynced });

  return new Response(
    JSON.stringify({ ok: true, elapsed, ...results, photosSynced }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
