import { createServerSupabaseClient, getCurrentUserRole, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverviewTabsCard } from "@/components/dashboard/OverviewTabsCard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Timesheets" };

function currentPeriod() {
  const n = new Date();
  return {
    year: n.getFullYear(),
    month: n.getMonth() + 1,
    week: Math.min(Math.ceil(n.getDate() / 7), 5),
  };
}

export default async function TimesheetsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { year, month, week } = currentPeriod();

  const [tsRes, exRes]: any[] = await Promise.all([
    supabase
      .from("timesheets")
      .select("id,year,month,week_number,status,employee_notes,manager_comments,created_at")
      .eq("employee_id", user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(20),
    supabase
      .from("expense_reports")
      .select("id,year,week_number,status,created_at")
      .eq("employee_id", user.id)
      .order("year", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(6),
  ]);

  const role = await getCurrentUserRole();
  const realTimesheets = tsRes.data ?? [];
  const realExpenses = exRes.data ?? [];
  const newExHref = `/expenses/new?year=${year}&week=${String(week).padStart(2, "0")}`;

  // Get current user's department
  const adminDb: any = createServiceClient();
  const { data: myProfile }: any = await supabase
    .from("profiles")
    .select("department")
    .eq("id", user.id)
    .maybeSingle();
  const userDept = (myProfile?.department ?? "").toLowerCase().trim();

  // Fetch directory members in same department for manager search (paginate past 1000 limit)
  const allDir: any[] = [];
  let dirFrom = 0;
  while (true) {
    let query = adminDb
      .from("directory_members")
      .select("azure_user_id, display_name, profile_id, department")
      .not("display_name", "is", null)
      .order("display_name")
      .range(dirFrom, dirFrom + 999);
    if (userDept) {
      query = query.ilike("department", userDept);
    }
    const { data } = await query;
    if (!data || data.length === 0) break;
    allDir.push(...data);
    if (data.length < 1000) break;
    dirFrom += 1000;
  }
  const managers = allDir
    .filter((m: any) => m.display_name && /^[a-zA-Z]/.test(m.display_name))
    .map((m: any) => ({ id: m.profile_id ?? m.azure_user_id, display_name: m.display_name }));

  // Get the employee's assigned manager — try employee_manager first, then directory_members
  let defaultManagerId = "";
  const { data: emRow }: any = await supabase
    .from("employee_manager")
    .select("manager_id")
    .eq("employee_id", user.id)
    .maybeSingle();
  if (emRow?.manager_id) {
    defaultManagerId = emRow.manager_id;
  } else {
    // Fallback: look up via directory_members manager_azure_id
    const { data: myDir }: any = await adminDb
      .from("directory_members")
      .select("manager_azure_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (myDir?.manager_azure_id) {
      // Find the manager in our managers list by azure_user_id
      const mgr = allDir.find((m: any) => m.azure_user_id === myDir.manager_azure_id);
      if (mgr) defaultManagerId = mgr.profile_id ?? mgr.azure_user_id;
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto" style={{ background: "#e8eaef" }}>
        <div className="px-4 py-4 max-w-5xl mx-auto">
          <OverviewTabsCard
            year={year}
            month={month}
            week={week}
            realTimesheets={realTimesheets as any[]}
            realExpenses={realExpenses as any[]}
            newExHref={newExHref}
            userRole={role}
            userId={user.id}
            managers={managers}
            defaultManagerId={defaultManagerId}
          />
        </div>
      </div>
    </div>
  );
}
