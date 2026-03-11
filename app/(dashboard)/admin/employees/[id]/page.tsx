import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import EmployeeProfilePanel from "@/components/admin/EmployeeProfilePanel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Employee Profile" };

export default async function AdminEmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const [
    profileResult,
    rolesResult,
    managerResult,
    reportsResult,
    hoursResult,
    timesheetsResult,
    expensesResult,
    leaveResult,
  ]: any[] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, email, department, job_title, office_location, avatar_url, employee_number, created_at")
      .eq("id", id)
      .single(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", id),
    supabase
      .from("employee_manager")
      .select("manager:profiles!employee_manager_manager_id_fkey(id, display_name)")
      .eq("employee_id", id)
      .maybeSingle(),
    supabase
      .from("employee_manager")
      .select("employee:profiles!employee_manager_employee_id_fkey(id, display_name)")
      .eq("manager_id", id),
    supabase
      .from("hours_config" as any)
      .select("contracted_hours, maximum_hours")
      .eq("employee_id", id)
      .maybeSingle(),
    supabase
      .from("timesheets")
      .select("id, year, week_number, status, total_hours")
      .eq("employee_id", id)
      .order("year", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(5),
    supabase
      .from("expense_reports")
      .select("id, title, status, weekly_total")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, status")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (profileResult.error || !profileResult.data) notFound();

  const profile = profileResult.data;
  const roles = (rolesResult.data ?? []).map((r: any) => r.role as string);
  const manager = managerResult?.data?.manager ?? null;
  const directReports = (reportsResult.data ?? [])
    .map((r: any) => r.employee)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Employee Profile"
        actions={
          <Link
            href="/admin/directory"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Directory
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <EmployeeProfilePanel
            profile={profile}
            roles={roles}
            manager={manager}
            directReports={directReports}
            hoursConfig={hoursResult.data ?? null}
            recentTimesheets={timesheetsResult.data ?? []}
            recentExpenses={expensesResult.data ?? []}
            recentLeave={leaveResult.data ?? []}
          />
        </div>
      </div>
    </div>
  );
}
