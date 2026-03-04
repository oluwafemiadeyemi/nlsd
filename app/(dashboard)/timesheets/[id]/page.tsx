import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { TimesheetWeekClient } from "@/components/timesheets/TimesheetWeekClient";
import type { TimesheetRow } from "@/domain/timesheets/types";
import { DAYS_OF_WEEK } from "@/domain/timesheets/types";
import { addDays, startOfWeek, format } from "date-fns";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === "new") return { title: "New Timesheet" };
  return { title: "Timesheet" };
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function TimesheetWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string; week?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="flex flex-col h-full"><TopBar title="Timesheet" /><div className="flex-1 flex items-center justify-center text-muted-foreground">Sign in to view timesheets</div></div>;

  const [{ data: profile }, { data: hoursConfig }, projectsResult, btResult]: any[] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", user.id).single(),
    supabase.from("hours_config" as any).select("contracted_hours, maximum_hours").eq("employee_id", user.id).single(),
    supabase.from("projects").select("id, code, title").eq("active", true).order("title"),
    supabase.from("billing_types").select("id, name, requires_project").eq("active", true).order("sort_order"),
  ]);

  // Manager for this employee
  const { data: managerRow }: any = await supabase
    .from("employee_manager")
    .select("manager_id")
    .eq("employee_id", user.id)
    .single();

  const projects = projectsResult.data ?? [];
  const billingTypes = btResult.data ?? [];

  const settings = {
    contractedHoursPerWeek: hoursConfig?.contracted_hours ?? 40,
    maximumHoursPerWeek: hoursConfig?.maximum_hours ?? 60,
    workWeekStart: "mon" as const,
  };

  if (id === "new") {
    const year = parseInt(sp.year ?? String(new Date().getFullYear()));
    const month = parseInt(sp.month ?? String(new Date().getMonth() + 1));
    const weekNumber = Math.min(parseInt(sp.week ?? "1"), 5);

    // Redirect if already exists
    const { data: existing }: any = await supabase
      .from("timesheets")
      .select("id")
      .eq("employee_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .eq("week_number", weekNumber)
      .single();

    if (existing) redirect(`/timesheets/${existing.id}`);

    const weekDates = buildWeekDates(year, month, weekNumber);
    const defaultBt = billingTypes.find((b: any) => b.requires_project) ?? billingTypes[0];
    const emptyRow: TimesheetRow = {
      id: "row-new-1",
      projectId: null,
      billingTypeId: defaultBt?.id ?? "",
      requiresProject: defaultBt?.requires_project ?? true,
      hours: Object.fromEntries(DAYS_OF_WEEK.map((d) => [d, 0])) as any,
    };

    return (
      <div className="flex flex-col h-full">
        <TopBar title={`New Timesheet — ${MONTH_NAMES[month]} ${year}, Week ${weekNumber}`} />
        <div className="flex-1 overflow-y-auto p-6">
          <TimesheetWeekClient
            timesheetId={null}
            userId={user.id}
            year={year}
            month={month}
            weekNumber={weekNumber}
            initialRows={[emptyRow]}
            settings={settings}
            projects={projects}
            billingTypes={billingTypes}
            weekDates={weekDates}
            status="draft"
            userRole="employee"
            userName={profile?.display_name ?? user.email ?? ""}
            userEmail={profile?.email ?? user.email ?? ""}
            managerId={managerRow?.manager_id ?? null}
            auditLog={[]}
          />
        </div>
      </div>
    );
  }

  // Load existing timesheet
  const { data: ts }: any = await supabase
    .from("timesheets")
    .select(`*, timesheet_rows (*)`)
    .eq("id", id)
    .single();

  if (!ts) notFound();

  // Load current user role for approve/reject buttons
  const { data: rolesData }: any = await supabase
    .from("user_roles" as any)
    .select("role")
    .eq("user_id", user.id);
  const roles = (rolesData ?? []).map((r: any) => r.role);
  const userRole = roles.includes("admin") ? "admin"
    : roles.includes("finance") ? "finance"
    : roles.includes("manager") ? "manager"
    : "employee";

  // Load audit log
  const { data: auditRaw }: any = await supabase
    .from("audit_log")
    .select("*, actor:profiles!actor_user_id(display_name)")
    .eq("entity_type", "timesheet")
    .eq("entity_id", id)
    .order("created_at");

  const auditLog = (auditRaw ?? []).map((a: any) => ({
    ...a,
    actorName: a.actor?.display_name ?? "System",
  }));

  const weekDates = buildWeekDates(ts.year, ts.month, ts.week_number);

  const rows: TimesheetRow[] = (ts.timesheet_rows ?? []).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    billingTypeId: r.billing_type_id,
    requiresProject: billingTypes.find((b: any) => b.id === r.billing_type_id)?.requires_project ?? true,
    hours: {
      sun: r.sun,
      mon: r.mon,
      tue: r.tue,
      wed: r.wed,
      thu: r.thu,
      fri: r.fri,
      sat: r.sat,
    },
  }));

  return (
    <div className="flex flex-col h-full">
      <TopBar title={`Timesheet — ${MONTH_NAMES[ts.month]} ${ts.year}, Week ${ts.week_number}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <TimesheetWeekClient
          timesheetId={ts.id}
          userId={user.id}
          year={ts.year}
          month={ts.month}
          weekNumber={ts.week_number}
          initialRows={rows}
          settings={settings}
          projects={projects}
          billingTypes={billingTypes}
          weekDates={weekDates}
          status={ts.status}
          userRole={userRole}
          userName={profile?.display_name ?? user.email ?? ""}
          userEmail={profile?.email ?? user.email ?? ""}
          managerId={ts.manager_id}
          submittedAt={ts.submitted_at}
          approvedAt={ts.approved_at}
          rejectedAt={ts.rejected_at}
          managerComments={ts.manager_comments}
          employeeNotes={ts.employee_notes}
          auditLog={auditLog}
        />
      </div>
    </div>
  );
}

/** Builds day → "MMM d" map for the nth week of a given month/year */
function buildWeekDates(year: number, month: number, weekNumber: number): Record<string, string> {
  // First day of the month, then find the Monday of the requested week
  const firstOfMonth = new Date(year, month - 1, 1);
  // First Monday on or after first of month
  const firstMonday = startOfWeek(firstOfMonth, { weekStartsOn: 1 });
  // Adjust if the Monday is before the month started
  const weekStart = addDays(firstMonday, (weekNumber - 1) * 7);

  const result: Record<string, string> = {};
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  days.forEach((day, i) => {
    result[day] = format(addDays(weekStart, i), "MMM d");
  });
  return result;
}
