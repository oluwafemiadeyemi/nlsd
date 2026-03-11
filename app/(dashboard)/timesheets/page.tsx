import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { fetchDepartmentManagers, resolveDefaultManager } from "@/lib/server/managers";
import { redirect } from "next/navigation";
import { OverviewTabsCard } from "@/components/dashboard/OverviewTabsCard";
import { currentExpensePeriod } from "@/domain/expenses/period";
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
  const expensePeriod = currentExpensePeriod(new Date());

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
      .select("id,year,month,week_number,status,created_at")
      .eq("employee_id", user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(6),
  ]);

  const role = await getCurrentUserRole();
  const realTimesheets = tsRes.data ?? [];
  const realExpenses = exRes.data ?? [];
  const newExHref = `/expenses/new?year=${expensePeriod.year}&month=${expensePeriod.month}&week=${expensePeriod.weekNumber}`;

  // Fetch department managers and resolve default manager
  const { data: myProfile }: any = await supabase
    .from("profiles").select("department").eq("id", user.id).maybeSingle();
  const { managers, allDir } = await fetchDepartmentManagers(myProfile?.department ?? "");
  const defaultManagerId = await resolveDefaultManager(supabase, user.id, allDir);

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
