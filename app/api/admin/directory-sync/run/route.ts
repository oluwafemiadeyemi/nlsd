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

export const maxDuration = 300; // 5 minutes — manager lookups for large orgs need time

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
  // Filter to only real person accounts: members (not guests), enabled
  const filter = "userType eq 'Member' and accountEnabled eq true";
  const url = `https://graph.microsoft.com/v1.0/users?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=999`;
  const allUsers = await graphGetAllPages<{ value: GraphUser[]; "@odata.nextLink"?: string }>(url) as GraphUser[];
  // Exclude non-person objects and students
  return allUsers.filter((u) =>
    (u.displayName || u.mail || u.userPrincipalName) &&
    (u.jobTitle ?? "").toLowerCase() !== "student"
  );
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

async function updateProgress(db: any, runId: string, message: string) {
  await db
    .from("directory_sync_runs")
    .update({ progress_status: message } as any)
    .eq("id", runId);
}

export async function POST() {
  const adminDb: any = createServiceClient();
  let runId: string = "";

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

    const { data: run, error: runErr } = await adminDb
      .from("directory_sync_runs")
      .insert({ status: "running", progress_status: "Authenticating..." } as any)
      .select("id")
      .single();
    if (runErr || !run) {
      throw new Error(runErr?.message ?? "Failed to create run record");
    }
    runId = run.id;

    const appConfig = await getAppConfig();

    await updateProgress(adminDb, runId, "Fetching group memberships...");
    const [adminMembers, financeMembers, managerMembers] = await Promise.all([
      fetchGroupMemberIds(appConfig.azureGroupAdmins),
      fetchGroupMemberIds(appConfig.azureGroupFinance),
      fetchGroupMemberIds(appConfig.azureGroupManagers),
    ]);

    await updateProgress(adminDb, runId, "Fetching all users from Entra ID...");
    const users = await fetchAllUsers();

    // Upsert all Entra users into directory_members first (no manager lookup needed yet)
    await updateProgress(adminDb, runId, `Syncing ${users.length} users to directory...`);
    const dirRows = users.map((u) => ({
      azure_user_id: u.id,
      email: (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim() || null,
      display_name: u.displayName ?? null,
      job_title: u.jobTitle ?? null,
      department: u.department ?? null,
      office_location: u.officeLocation ?? null,
      employee_id: u.employeeId ?? null,
      synced_at: new Date().toISOString(),
    }));
    for (const batch of chunk(dirRows, 500)) {
      const { error } = await adminDb
        .from("directory_members")
        .upsert(batch, { onConflict: "azure_user_id" });
      if (error) throw new Error(`directory_members upsert: ${error.message}`);
    }

    // Link directory_members to profiles where email matches
    await updateProgress(adminDb, runId, "Linking directory members to app profiles...");

    await updateProgress(adminDb, runId, `Matching ${users.length} users to existing profiles...`);
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

    // Auto-provision auth users (and profiles via handle_new_user trigger)
    // for Entra members who don't have an app profile yet.
    const usersToProvision = users.filter((u) => {
      const email = (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim();
      return email && !profileByEmail.has(email);
    });
    let profilesProvisioned = 0;
    if (usersToProvision.length > 0) {
      await updateProgress(adminDb, runId, `Provisioning ${usersToProvision.length} new user profiles...`);
      await mapWithConcurrency(usersToProvision, 5, async (u) => {
        const email = (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim();
        try {
          const { error: createErr } = await adminDb.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              full_name: u.displayName ?? email.split("@")[0],
              azure_user_id: u.id,
            },
          });
          if (createErr) return; // user may already exist in auth.users
          profilesProvisioned++;
        } catch {
          // Non-fatal: skip this user
        }
      });

      // Re-fetch profiles to include newly created ones
      profileByEmail.clear();
      for (const part of chunk(emails, 500)) {
        const { data, error } = await adminDb
          .from("profiles")
          .select("id, email, azure_user_id")
          .in("email", part);
        if (error) throw new Error(error.message);
        for (const p of data ?? []) profileByEmail.set((p.email ?? "").toLowerCase(), p as any);
      }
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
      await updateProgress(adminDb, runId, `Updating ${profileUpdates.length} profiles...`);
      const { error } = await adminDb
        .from("profiles")
        .upsert(profileUpdates, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    const { data: allProfiles, error: allProfilesErr } = await adminDb
      .from("profiles")
      .select("id, email, azure_user_id, avatar_url");

    // Link directory_members.profile_id to profiles by azure_user_id
    for (const p of allProfiles ?? []) {
      if (p.azure_user_id) {
        await adminDb
          .from("directory_members")
          .update({ profile_id: p.id } as any)
          .eq("azure_user_id", p.azure_user_id);
      }
    }
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
    if (usersNeedingPhotos.length > 0) {
      await updateProgress(adminDb, runId, `Syncing photos for ${usersNeedingPhotos.length} users...`);
    }
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

    // Look up managers for ALL directory members so the directory shows each employee's manager
    const allAzureIds = users.map((u) => u.id);
    let managerLinksCount = 0;
    if (allAzureIds.length > 0) {
      await updateProgress(adminDb, runId, `Looking up managers for ${allAzureIds.length} employees...`);
      let looked = 0;
      const managerPairs = await mapWithConcurrency(
        allAzureIds,
        MANAGER_LOOKUP_CONCURRENCY,
        async (azureId) => {
          const result = { userAzureId: azureId, managerAzureId: await fetchManagerIdForUser(azureId) };
          looked++;
          if (looked % 200 === 0) {
            await updateProgress(adminDb, runId, `Looking up managers... ${looked}/${allAzureIds.length}`);
          }
          return result;
        }
      );

      // Batch update directory_members with manager_azure_id
      const mgrUpdates = managerPairs
        .filter((p) => p.managerAzureId)
        .map((p) => ({ azure_user_id: p.userAzureId, manager_azure_id: p.managerAzureId }));
      for (const batch of chunk(mgrUpdates, 500)) {
        for (const item of batch) {
          await adminDb
            .from("directory_members")
            .update({ manager_azure_id: item.manager_azure_id } as any)
            .eq("azure_user_id", item.azure_user_id);
        }
      }
      managerLinksCount = mgrUpdates.length;

      // Also update employee_manager table for users who have app profiles
      const managerRows: Array<{ employee_id: string; manager_id: string | null }> = [];
      for (const pair of managerPairs) {
        const emp = profileByAzureId.get(pair.userAzureId);
        if (!emp) continue;
        const mgr = pair.managerAzureId ? profileByAzureId.get(pair.managerAzureId) : null;
        managerRows.push({ employee_id: emp.id, manager_id: mgr?.id ?? null });
      }
      if (managerRows.length) {
        const { error } = await adminDb
          .from("employee_manager")
          .upsert(managerRows, { onConflict: "employee_id" });
        if (error) throw new Error(error.message);
      }
    }

    await updateProgress(adminDb, runId, "Syncing role assignments...");
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
        profiles_provisioned: profilesProvisioned,
        profiles_updated: profileUpdates.length,
        manager_links_upserted: managerLinksCount,
        role_grants_upserted: roleRowsToUpsert.length,
        roles_removed: rolesRemoved,
        progress_status: "Complete",
        error: null,
      } as any)
      .eq("id", runId);

    await writeAudit({
      actorUserId: null,
      entityType: "directory_sync",
      entityId: runId,
      action: "sync_success",
      comment: `Users=${users.length}, provisioned=${profilesProvisioned}, profiles=${profileUpdates.length}, photos=${photosSynced}, managers=${managerLinksCount}, roleGrants=${roleRowsToUpsert.length}, rolesRemoved=${rolesRemoved}`,
    });

    return NextResponse.json({
      ok: true,
      runId,
      usersFetched: users.length,
      profilesProvisioned,
      profilesUpdated: profileUpdates.length,
      photosSynced,
      managerLinksUpserted: managerLinksCount,
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
