/**
 * Netlify Function: admin-directory-sync-run
 *
 * POST /api/admin/directory-sync-run
 * Authorization: Bearer <supabase_access_token>
 *
 * Manually triggers a directory sync from Microsoft Entra ID:
 * - Upserts profiles (display_name, job_title, department, etc.)
 * - Upserts employee_manager relationships (concurrency-limited)
 * - Grants roles based on Entra group membership
 * - Removes roles no longer present (strict sync)
 * - Logs the run to directory_sync_runs
 */

import type { Config, Context } from "@netlify/functions";
import { json, getBearerToken, requireMethod } from "./_lib/http";
import { supabaseAdmin, supabaseUser } from "./_lib/supabase";
import { writeAudit } from "./_lib/audit";
import { graphGet, graphGetAllPages, graphGetBinary } from "./_lib/graph/client";
import { mapWithConcurrency } from "./_lib/graph/concurrency";

export const config: Config = { path: "/api/admin/directory-sync-run" };


const ADMIN_GROUP_ID = process.env.AZURE_GROUP_ADMINS!;
const FINANCE_GROUP_ID = process.env.AZURE_GROUP_FINANCE ?? "";
const MANAGER_GROUP_ID = process.env.AZURE_GROUP_MANAGERS!;
const MANAGER_LOOKUP_CONCURRENCY = Number(process.env.GRAPH_MANAGER_LOOKUP_CONCURRENCY ?? "10");

type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  employeeId?: string | null;
};

async function fetchAllUsers(): Promise<GraphUser[]> {
  const select = [
    "id", "displayName", "mail", "userPrincipalName",
    "jobTitle", "department", "officeLocation", "employeeId",
  ].join(",");
  const url = `https://graph.microsoft.com/v1.0/users?$select=${encodeURIComponent(select)}&$top=999`;
  return graphGetAllPages<{ value: GraphUser[]; "@odata.nextLink"?: string }>(url) as Promise<GraphUser[]>;
}

async function fetchGroupMemberIds(groupId: string): Promise<Set<string>> {
  const url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id&$top=999`;
  const members = await graphGetAllPages<{ value: Array<{ id: string }>; "@odata.nextLink"?: string }>(url);
  return new Set((members as Array<{ id: string }>).map((m) => m.id));
}

async function fetchManagerIdForUser(userId: string): Promise<string | null> {
  try {
    const res = await graphGet<{ id?: string }>(
      `https://graph.microsoft.com/v1.0/users/${userId}/manager?$select=id`
    );
    return res?.id ?? null;
  } catch {
    return null;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

export default async function handler(req: Request, _context: Context) {
  const methodErr = requireMethod(req, "POST");
  if (methodErr) return methodErr;

  const adminDb = supabaseAdmin();
  let runId: string | null = null;

  try {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Bearer token" });

    // Check caller has admin role (via user-context client, respects RLS)
    const userDb = supabaseUser(token);
    const { data: roleRows, error: roleErr } = await userDb
      .from("user_roles")
      .select("role")
      .eq("role", "admin")
      .limit(1);
    if (roleErr || !roleRows || roleRows.length === 0) {
      return json(403, { error: "Admin role required" });
    }

    // Create sync run record
    const { data: run, error: runErr } = await adminDb
      .from("directory_sync_runs")
      .insert({ status: "running" } as any)
      .select("id")
      .single();
    if (runErr || !run) throw new Error(runErr?.message ?? "Failed to create run record");
    runId = run.id;

    // 1) Fetch role groups in parallel
    const [adminMembers, financeMembers, managerMembers] = await Promise.all([
      fetchGroupMemberIds(ADMIN_GROUP_ID),
      fetchGroupMemberIds(FINANCE_GROUP_ID),
      fetchGroupMemberIds(MANAGER_GROUP_ID),
    ]);

    // 2) Fetch all users from Graph
    const users = await fetchAllUsers();

    // 3) Concurrency-limited manager lookup
    const managerPairs = await mapWithConcurrency(
      users,
      MANAGER_LOOKUP_CONCURRENCY,
      async (u) => ({ userAzureId: u.id, managerAzureId: await fetchManagerIdForUser(u.id) })
    );
    const managerMap = new Map<string, string | null>();
    for (const p of managerPairs) managerMap.set(p.userAzureId, p.managerAzureId);

    // 4) Map Graph users to existing profiles by email (chunked for large orgs)
    const emails = users
      .map((u) => (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim())
      .filter(Boolean);

    const profileByEmail = new Map<string, { id: string; email: string; azure_user_id: string | null }>();
    for (const part of chunk(emails, 500)) {
      const { data, error } = await adminDb
        .from("profiles")
        .select("id, email, azure_user_id")
        .in("email", part);
      if (error) throw new Error(error.message);
      for (const p of data ?? []) profileByEmail.set((p.email ?? "").toLowerCase(), p as any);
    }

    // 5) Build profile updates for matched users
    const profileUpdates: any[] = [];
    for (const u of users) {
      const email = (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim();
      if (!email) continue;
      const p = profileByEmail.get(email);
      if (!p) continue; // not yet in Supabase — must SSO-login first

      profileUpdates.push({
        id: p.id,
        email,
        display_name: u.displayName ?? null,
        azure_user_id: u.id,
        job_title: u.jobTitle ?? null,
        department: u.department ?? null,
      });
    }

    if (profileUpdates.length) {
      const { error } = await adminDb
        .from("profiles")
        .upsert(profileUpdates, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    // Reload profiles to get azure_user_id → profile.id map
    const { data: allProfiles, error: allProfilesErr } = await adminDb
      .from("profiles")
      .select("id, email, azure_user_id, avatar_url");
    if (allProfilesErr) throw new Error(allProfilesErr.message);

    const profileByAzureId = new Map<string, { id: string; email: string; avatar_url: string | null }>();
    for (const p of allProfiles ?? []) {
      if (p.azure_user_id) profileByAzureId.set(p.azure_user_id, { id: p.id, email: p.email ?? "", avatar_url: p.avatar_url ?? null });
    }

    // 5b) Sync profile photos from Entra (skip users who already have an avatar)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const usersNeedingPhotos = users.filter((u) => {
      const p = profileByAzureId.get(u.id);
      return p && !p.avatar_url;
    });

    let photosSynced = 0;
    await mapWithConcurrency(usersNeedingPhotos, 5, async (u) => {
      try {
        const photoData = await graphGetBinary(
          `https://graph.microsoft.com/v1.0/users/${u.id}/photo/$value`
        );
        if (!photoData) return; // user has no photo in Entra

        const p = profileByAzureId.get(u.id)!;
        const path = `${p.id}/avatar.jpg`;
        const blob = new Blob([photoData], { type: "image/jpeg" });

        const { error: uploadErr } = await adminDb.storage
          .from("avatars")
          .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (uploadErr) return;

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
        await adminDb
          .from("profiles")
          .update({ avatar_url: publicUrl } as any)
          .eq("id", p.id);

        photosSynced++;
      } catch {
        // Non-fatal: skip photo for this user
      }
    });

    // 6) Upsert employee_manager relationships
    const managerRows: Array<{ employee_id: string; manager_id: string | null }> = [];
    for (const [userAzureId, mgrAzureId] of managerMap.entries()) {
      const emp = profileByAzureId.get(userAzureId);
      if (!emp) continue;
      const mgr = mgrAzureId ? profileByAzureId.get(mgrAzureId) : null;
      managerRows.push({ employee_id: emp.id, manager_id: mgr?.id ?? null });
    }
    if (managerRows.length) {
      const { error } = await adminDb
        .from("employee_manager")
        .upsert(managerRows, { onConflict: "employee_id" });
      if (error) throw new Error(error.message);
    }

    // 7) Build desired roles from group membership
    const desiredRoles = new Map<string, Set<"admin" | "finance" | "manager">>();
    for (const [azureId, p] of profileByAzureId.entries()) {
      const s = new Set<"admin" | "finance" | "manager">();
      if (adminMembers.has(azureId)) s.add("admin");
      if (financeMembers.has(azureId)) s.add("finance");
      if (managerMembers.has(azureId)) s.add("manager");
      if (s.size) desiredRoles.set(p.id, s);
    }

    const roleRowsToUpsert: Array<{ user_id: string; role: string }> = [];
    for (const [userId, roles] of desiredRoles.entries()) {
      for (const role of roles) roleRowsToUpsert.push({ user_id: userId, role });
    }
    if (roleRowsToUpsert.length) {
      const { error } = await adminDb
        .from("user_roles")
        .upsert(roleRowsToUpsert as any, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    }

    // 8) Strict removal: remove admin/finance/manager roles no longer in groups
    const { data: existingRoles, error: existingErr } = await adminDb
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "finance", "manager"]);
    if (existingErr) throw new Error(existingErr.message);

    const toRemove = (existingRoles ?? []).filter((r) => {
      const want = desiredRoles.get(r.user_id as string);
      return !(want?.has(r.role as "admin" | "finance" | "manager") ?? false);
    });

    let rolesRemoved = 0;
    for (const r of toRemove) {
      const { error } = await adminDb
        .from("user_roles")
        .delete()
        .eq("user_id", r.user_id as string)
        .eq("role", r.role as string);
      if (!error) rolesRemoved++;
    }

    // 9) Mark run success
    await adminDb
      .from("directory_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        users_fetched: users.length,
        profiles_updated: profileUpdates.length,
        manager_links_upserted: managerRows.length,
        role_grants_upserted: roleRowsToUpsert.length,
        roles_removed: rolesRemoved,
        error: null,
      } as any)
      .eq("id", runId);

    await writeAudit({
      actorUserId: null,
      entityType: "directory_sync",
      entityId: runId,
      action: "sync_success",
      comment: `Users=${users.length}, profiles=${profileUpdates.length}, photos=${photosSynced}, managers=${managerRows.length}, roleGrants=${roleRowsToUpsert.length}, rolesRemoved=${rolesRemoved}`,
    });

    return json(200, {
      ok: true,
      runId,
      usersFetched: users.length,
      profilesUpdated: profileUpdates.length,
      photosSynced,
      managerLinksUpserted: managerRows.length,
      roleGrantsUpserted: roleRowsToUpsert.length,
      rolesRemoved,
      managerLookupConcurrency: MANAGER_LOOKUP_CONCURRENCY,
    });
  } catch (err: any) {
    if (runId) {
      await adminDb
        .from("directory_sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: err?.message ?? "Directory sync failed",
        } as any)
        .eq("id", runId);
    }

    await writeAudit({
      actorUserId: null,
      entityType: "directory_sync",
      entityId: runId,
      action: "sync_failed",
      comment: err?.message ?? "Directory sync failed",
    }).catch(() => null);

    return json(500, { error: err?.message ?? "Directory sync failed", runId });
  }
}
