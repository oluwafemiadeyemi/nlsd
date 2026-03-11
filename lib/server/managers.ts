import { createServiceClient } from "@/lib/supabase/server";

export type ManagerOption = { id: string; display_name: string };

/**
 * Fetch directory members in the same department as the user.
 * Falls back to all members if no department is set.
 */
export async function fetchDepartmentManagers(userDept: string): Promise<{
  managers: ManagerOption[];
  allDir: Array<{ azure_user_id: string; display_name: string; profile_id: string | null; department: string | null }>;
}> {
  const adminDb: any = createServiceClient();
  const dept = (userDept ?? "").toLowerCase().trim();
  const allDir: any[] = [];
  let from = 0;
  while (true) {
    let query = adminDb
      .from("directory_members")
      .select("azure_user_id, display_name, profile_id, department")
      .not("display_name", "is", null)
      .order("display_name")
      .range(from, from + 999);
    if (dept) {
      query = query.ilike("department", dept);
    }
    const { data } = await query;
    if (!data || data.length === 0) break;
    allDir.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  // Only include members who have an app profile (profile_id is not null).
  // This ensures manager_id FK to profiles.id will never fail.
  const managers = allDir
    .filter((m: any) => m.display_name && /^[a-zA-Z]/.test(m.display_name) && m.profile_id)
    .map((m: any) => ({ id: m.profile_id, display_name: m.display_name }));
  return { managers, allDir };
}

/**
 * Resolve the default manager for an employee.
 * Tries employee_manager table first, then falls back to directory_members.manager_azure_id.
 */
export async function resolveDefaultManager(
  supabase: any,
  userId: string,
  allDir: Array<{ azure_user_id: string; profile_id: string | null }>,
): Promise<string> {
  const { data: emRow }: any = await supabase
    .from("employee_manager")
    .select("manager_id")
    .eq("employee_id", userId)
    .maybeSingle();
  if (emRow?.manager_id) return emRow.manager_id;

  // Fallback: directory_members manager_azure_id
  const adminDb: any = createServiceClient();
  const { data: myDir }: any = await adminDb
    .from("directory_members")
    .select("manager_azure_id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (myDir?.manager_azure_id) {
    const mgr = allDir.find((m: any) => m.azure_user_id === myDir.manager_azure_id);
    if (mgr?.profile_id) return mgr.profile_id;
  }
  return "";
}
