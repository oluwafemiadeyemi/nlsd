import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ExpenseWeekClient } from "@/components/expenses/ExpenseWeekClient";
import type { ExpenseDay } from "@/domain/expenses/types";
import { EXPENSE_DAYS, DAY_INDEX } from "@/domain/expenses/types";
import { emptyExpenseDaysMap } from "@/domain/expenses/calculations";
import { addDays, startOfISOWeek, format } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Expense Claim" };

/** ISO week number (1-52) → Monday of that week */
function weekNumberToMonday(year: number, weekNum: number): Date {
  const jan4 = new Date(year, 0, 4); // Jan 4 is always in ISO week 1
  const startOfWeek1 = startOfISOWeek(jan4);
  return addDays(startOfWeek1, (weekNum - 1) * 7);
}

/** Build day → "MMM d" for Mon-Sat from a Monday start */
function buildWeekDates(weekStart: Date): Partial<Record<ExpenseDay, string>> {
  const result: Partial<Record<ExpenseDay, string>> = {};
  EXPENSE_DAYS.forEach((day) => {
    result[day] = format(addDays(weekStart, DAY_INDEX[day]), "MMM d");
  });
  return result;
}

export default async function ExpenseReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; week?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="flex flex-col h-full"><TopBar title="Expense Claim" /><div className="flex-1 flex items-center justify-center text-muted-foreground">Sign in to view expenses</div></div>;

  const [{ data: profile }, { data: managerRow }]: any[] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", user.id).single(),
    supabase.from("employee_manager").select("manager_id").eq("employee_id", user.id).single(),
  ]);

  // Get current user mileage rate for this year
  const currentYear = new Date().getFullYear();
  const { data: rateRow }: any = await supabase
    .from("mileage_rate_config" as any)
    .select("rate_per_km")
    .eq("employee_id", user.id)
    .eq("year", currentYear)
    .single();
  const ratePerKm = rateRow?.rate_per_km ?? 0.61;

  // Get user roles
  const { data: rolesData }: any = await supabase.from("user_roles" as any).select("role").eq("user_id", user.id);
  const roles = (rolesData ?? []).map((r: any) => r.role);
  const userRole = roles.includes("admin") ? "admin"
    : roles.includes("finance") ? "finance"
    : roles.includes("manager") ? "manager"
    : "employee";

  if (id === "new") {
    const year = parseInt(sp.year ?? String(currentYear));
    const weekNum = parseInt(sp.week ?? "01");
    const weekNumber = String(weekNum).padStart(2, "0");

    const { data: existing }: any = await supabase
      .from("expense_reports")
      .select("id")
      .eq("employee_id", user.id)
      .eq("year", year)
      .eq("week_number", weekNumber)
      .single();

    if (existing) redirect(`/expenses/${existing.id}`);

    const weekStart = weekNumberToMonday(year, weekNum);
    const weekDates = buildWeekDates(weekStart);

    return (
      <div className="flex flex-col h-full">
        <TopBar title={`New Expense Claim — Week ${weekNumber}, ${year}`} />
        <div className="flex-1 overflow-y-auto p-6">
          <ExpenseWeekClient
            reportId={null}
            userId={user.id}
            weekNumber={weekNumber}
            year={year}
            weekBeginningDate={format(weekStart, "yyyy-MM-dd")}
            initialDays={emptyExpenseDaysMap()}
            ratePerKm={ratePerKm}
            weekDates={weekDates}
            status="draft"
            userRole={userRole}
            userName={profile?.display_name ?? user.email ?? ""}
            userEmail={profile?.email ?? user.email ?? ""}
            managerId={managerRow?.manager_id ?? null}
            auditLog={[]}
          />
        </div>
      </div>
    );
  }

  // Load existing report
  const { data: report }: any = await supabase
    .from("expense_reports")
    .select("*, expense_entries(*)")
    .eq("id", id)
    .single();

  if (!report) notFound();

  // Load audit log
  const { data: auditRaw }: any = await supabase
    .from("audit_log")
    .select("*, actor:profiles!actor_user_id(display_name)")
    .eq("entity_type", "expense_report")
    .eq("entity_id", id)
    .order("created_at");

  const auditLog = (auditRaw ?? []).map((a: any) => ({
    ...a,
    actorName: a.actor?.display_name ?? "System",
  }));

  // Map expense_entries (day_index 0-5) → ExpenseDayEntry keyed by day name
  const days = emptyExpenseDaysMap();
  const IDX_TO_DAY: ExpenseDay[] = ["mon", "tue", "wed", "thu", "fri", "sat"];
  for (const e of (report.expense_entries ?? []) as any[]) {
    const day = IDX_TO_DAY[e.day_index] as ExpenseDay | undefined;
    if (!day) continue;
    days[day] = {
      mileageKm: e.mileage_km,
      mileageCostClaimed: e.mileage_cost_claimed,
      lodging: e.lodging_amount,
      breakfast: e.breakfast_amount,
      lunch: e.lunch_amount,
      dinner: e.dinner_amount,
      other: e.other_amount,
      notes: e.other_note ?? "",
      travelFrom: e.travel_from ?? "",
      travelTo: e.travel_to ?? "",
      otherNote: e.other_note ?? "",
    };
  }

  const weekNum = parseInt(report.week_number);
  const weekStart = new Date(report.week_beginning_date);
  const weekDates = buildWeekDates(weekStart);

  return (
    <div className="flex flex-col h-full">
      <TopBar title={`Expense Claim — Week ${report.week_number}, ${report.year}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <ExpenseWeekClient
          reportId={report.id}
          userId={user.id}
          weekNumber={report.week_number}
          year={report.year}
          weekBeginningDate={report.week_beginning_date}
          initialDays={days}
          ratePerKm={ratePerKm}
          weekDates={weekDates}
          status={report.status}
          userRole={userRole}
          userName={profile?.display_name ?? user.email ?? ""}
          userEmail={profile?.email ?? user.email ?? ""}
          managerId={report.manager_id}
          submittedAt={report.submitted_at}
          approvedAt={report.approved_at}
          rejectedAt={report.rejected_at}
          managerComments={report.manager_comments}
          employeeNotes={report.employee_notes}
          destination={report.destination}
          auditLog={auditLog}
        />
      </div>
    </div>
  );
}
