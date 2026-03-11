import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { fetchDepartmentManagers, resolveDefaultManager } from "@/lib/server/managers";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ExpenseWeekClient } from "@/components/expenses/ExpenseWeekClient";
import type { ExpenseDay } from "@/domain/expenses/types";
import { EXPENSE_DAYS, DAY_INDEX } from "@/domain/expenses/types";
import { emptyExpenseDaysMap } from "@/domain/expenses/calculations";
import {
  buildExpenseWeekDates,
  formatExpensePeriodLabel,
  formatExpenseWeekNumber,
  getExpenseWeekBlockStart,
  getExpenseWeekCount,
} from "@/domain/expenses/period";
import { format } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Expense Claim" };

export default async function ExpenseReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string; week?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile }: any = await supabase
    .from("profiles")
    .select("display_name, email, department")
    .eq("id", user.id)
    .single();

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const userRole = await getCurrentUserRole();

  const { managers, allDir } = await fetchDepartmentManagers(profile?.department ?? "");
  const defaultManagerId = await resolveDefaultManager(supabase, user.id, allDir);

  if (id === "new") {
    const year = clamp(Number.parseInt(sp.year ?? String(currentYear), 10), 2000, 2100);
    const month = clamp(Number.parseInt(sp.month ?? String(currentMonth), 10), 1, 12);
    const maxWeek = getExpenseWeekCount(year, month);
    const weekNumber = formatExpenseWeekNumber(
      clamp(Number.parseInt(sp.week ?? "01", 10), 1, maxWeek)
    );

    const { data: existing }: any = await supabase
      .from("expense_reports")
      .select("id")
      .eq("employee_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .eq("week_number", weekNumber)
      .maybeSingle();

    if (existing) redirect(`/expenses/${existing.id}`);

    const weekStart = getExpenseWeekBlockStart(year, month, weekNumber);
    const weekDates = buildExpenseWeekDates(year, month, weekNumber);
    const periodLabel = formatExpensePeriodLabel({ year, month, weekNumber });

    return (
      <div className="flex flex-col h-full">
        <TopBar title={`New Expense Claim — ${periodLabel}`} />
        <div className="flex-1 overflow-y-auto p-6">
          <ExpenseWeekClient
            reportId={null}
            userId={user.id}
            month={month}
            weekNumber={weekNumber}
            year={year}
            weekBeginningDate={format(weekStart, "yyyy-MM-dd")}
            initialDays={emptyExpenseDaysMap()}
            weekDates={weekDates}
            status="draft"
            userRole={userRole}
            userName={profile?.display_name ?? user.email ?? ""}
            userEmail={profile?.email ?? user.email ?? ""}
            managerId={defaultManagerId || null}
            managers={managers}
            defaultManagerId={defaultManagerId}
            auditLog={[]}
          />
        </div>
      </div>
    );
  }

  const { data: report }: any = await supabase
    .from("expense_reports")
    .select("*, expense_entries(*)")
    .eq("id", id)
    .single();

  if (!report) notFound();

  const { data: auditRaw }: any = await supabase
    .from("audit_log")
    .select("*, actor:profiles!actor_user_id(display_name)")
    .eq("entity_type", "expense_report")
    .eq("entity_id", id)
    .order("created_at");

  const auditLog = (auditRaw ?? []).map((entry: any) => ({
    ...entry,
    actorName: entry.actor?.display_name ?? "System",
  }));

  const days = emptyExpenseDaysMap();
  const indexToDay: ExpenseDay[] = ["mon", "tue", "wed", "thu", "fri", "sat"];
  for (const entry of (report.expense_entries ?? []) as any[]) {
    const day = indexToDay[entry.day_index] as ExpenseDay | undefined;
    if (!day) continue;
    days[day] = {
      travelFrom: entry.travel_from ?? "",
      travelTo: entry.travel_to ?? "",
      mileageKm: entry.mileage_km ?? 0,
      mileageCost: entry.mileage_cost ?? 0,
      lodging: entry.lodging_amount,
      breakfast: entry.breakfast_amount,
      lunch: entry.lunch_amount,
      dinner: entry.dinner_amount,
      other: entry.other_amount,
      notes: entry.notes ?? "",
      otherNote: entry.other_note ?? "",
    };
  }

  const weekDates = buildExpenseWeekDates(report.year, report.month, report.week_number);
  const periodLabel = formatExpensePeriodLabel({
    year: report.year,
    month: report.month,
    weekNumber: report.week_number,
  });

  return (
    <div className="flex flex-col h-full">
      <TopBar title={`Expense Claim — ${periodLabel}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <ExpenseWeekClient
          reportId={report.id}
          userId={user.id}
          employeeId={report.employee_id}
          month={report.month}
          weekNumber={report.week_number}
          year={report.year}
          weekBeginningDate={report.week_beginning_date}
          initialDays={days}
          weekDates={weekDates}
          status={report.status}
          userRole={userRole}
          userName={profile?.display_name ?? user.email ?? ""}
          userEmail={profile?.email ?? user.email ?? ""}
          managerId={report.manager_id || defaultManagerId || null}
          managers={managers}
          defaultManagerId={defaultManagerId}
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
