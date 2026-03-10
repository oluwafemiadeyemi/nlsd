/**
 * POST /api/admin/directory-sync/run
 *
 * Manually triggers a directory sync from Microsoft Entra ID.
 * Requires admin role (checked via cookie-based session).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/server/audit";
import { graphGet, graphGetAllPages, graphGetBinary } from "@/lib/server/graph/client";
import { mapWithConcurrency } from "@/lib/server/graph/concurrency";
import { getAppConfig } from "@/lib/config/appConfig";

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

export async function POST() {
  // Diagnostic: log env var presence + partial values for verification
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  console.log(`[sync] URL: "${url.substring(0, 30)}..." (${url.length})`);
  console.log(`[sync] ANON_KEY starts: "${anon.substring(0, 20)}..." (${anon.length})`);
  console.log(`[sync] SERVICE_ROLE_KEY starts: "${srk.substring(0, 20)}..." ends: "...${srk.substring(srk.length - 10)}" (${srk.length})`);

  const adminDb: any = createServiceClient();
  let runId: string | null = null;

  try {
    // Auth: cookie-based session
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Check admin role
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);
    if (!roleRows || roleRows.length === 0) {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    console.log("[sync] Auth passed, inserting run record...");
    const { data: run, error: runErr } = await adminDb
      .from("directory_sync_runs")
      .insert({ status: "running" } as any)
      .select("id")
      .single();
    if (runErr || !run) {
      console.error("[sync] Run insert failed:", runErr?.message, runErr?.code);
      throw new Error(runErr?.message ?? "Failed to create run record");
    }
    runId = run.id;

    const appConfig = await getAppConfig();

    const [adminMembers, financeMembers, managerMembers] = await Promise.all([
      fetchGroupMemberIds(appConfig.azureGroupAdmins),
      fetchGroupMemberIds(appConfig.azureGroupFinance),
      fetchGroupMemberIds(appConfig.azureGroupManagers),
    ]);

    const users = await fetchAllUsers();

    const managerPairs = await mapWithConcurrency(
      users,
      MANAGER_LOOKUP_CONCURRENCY,
      async (u) => ({ userAzureId: u.id, managerAzureId: await fetchManagerIdForUser(u.id) })
    );
    const managerMap = new Map<string, string | null>();
    for (const p of managerPairs) managerMap.set(p.userAzureId, p.managerAzureId);

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

    const profileUpdates: any[] = [];
    for (const u of users) {
      const email = (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim();
      if (!email) continue;
      const p = profileByEmail.get(email);
      if (!p) continue;

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

    const { data: allProfiles, error: allProfilesErr } = await adminDb
      .from("profiles")
      .select("id, email, azure_user_id, avatar_url");
    if (allProfilesErr) throw new Error(allProfilesErr.message);

    const profileByAzureId = new Map<string, { id: string; email: string; avatar_url: string | null }>();
    for (const p of allProfiles ?? []) {
      if (p.azure_user_id) profileByAzureId.set(p.azure_user_id, { id: p.id, email: p.email ?? "", avatar_url: p.avatar_url ?? null });
    }

    // Sync profile photos from Entra
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
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
        if (!photoData) return;

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

    // Upsert employee_manager relationships
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

    // Build desired roles from group membership
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

    // Strict removal: remove admin/finance/manager roles no longer in groups
    const { data: existingRoles, error: existingErr } = await adminDb
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "finance", "manager"]);
    if (existingErr) throw new Error(existingErr.message);

    const toRemove = (existingRoles ?? []).filter((r: any) => {
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

    return NextResponse.json({
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

    return NextResponse.json({ error: err?.message ?? "Directory sync failed", runId }, { status: 500 });
  }
}
