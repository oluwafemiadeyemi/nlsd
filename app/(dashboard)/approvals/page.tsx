import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ApprovalsInbox } from "@/components/approvals/ApprovalsInbox";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = await getCurrentUserRole();
  if (role === "employee") redirect("/dashboard");

  // Managers see items awaiting their review (submitted);
  // Finance/Admin see items awaiting final approval (manager_approved) + submitted.
  const exStatuses = role === "manager" ? ["submitted"] : ["manager_approved", "submitted"];

  const [exResult, tsResult, leaveResult]: any[] = await Promise.all([
    supabase
      .from("expense_reports")
      .select(`
        id, year, week_number, destination, status, submitted_at,
        employee:profiles!employee_id(id, display_name, email, department),
        expense_entries(mileage_cost_claimed, lodging_amount, breakfast_amount, lunch_amount, dinner_amount, other_amount)
      `)
      .in("status", exStatuses)
      .order("submitted_at"),
    supabase
      .from("timesheets")
      .select(`
        id, year, month, week_number, total_hours, status, submitted_at,
        employee:profiles!employee_id(id, display_name, email, department)
      `)
      .in("status", exStatuses)
      .order("submitted_at"),
    supabase
      .from("leave_requests")
      .select(`
        id, leave_type, start_date, end_date, total_hours, status, submitted_at,
        employee:profiles!employee_id(id, display_name, email, department)
      `)
      .in("status", exStatuses)
      .order("submitted_at"),
  ]);

  const expenses = (exResult.data ?? []).map((e: any) => {
    const total = (e.expense_entries ?? []).reduce(
      (s: number, en: any) =>
        s + (en.mileage_cost_claimed ?? 0) + (en.lodging_amount ?? 0) +
        (en.breakfast_amount ?? 0) + (en.lunch_amount ?? 0) +
        (en.dinner_amount ?? 0) + (en.other_amount ?? 0),
      0
    );
    return {
      id: e.id,
      type: "expense" as const,
      period: `Week ${e.week_number}, ${e.year}`,
      status: e.status,
      amountLabel: `$${total.toFixed(2)}`,
      submittedAt: e.submitted_at,
      user: { id: e.employee?.id, display_name: e.employee?.display_name ?? "—", email: e.employee?.email ?? "", department: e.employee?.department },
      href: `/expenses/${e.id}`,
    };
  });

  const timesheets = (tsResult.data ?? []).map((t: any) => {
    const period = t.week_number === 0
      ? `${monthName(t.month)} ${t.year}`
      : `Week ${t.week_number}, ${monthName(t.month)} ${t.year}`;
    return {
      id: t.id,
      type: "timesheet" as const,
      period,
      status: t.status,
      amountLabel: `${(t.total_hours ?? 0).toFixed(1)} hrs`,
      submittedAt: t.submitted_at,
      user: { id: t.employee?.id, display_name: t.employee?.display_name ?? "—", email: t.employee?.email ?? "", department: t.employee?.department },
      href: `/dashboard`,
    };
  });

  const leaves = (leaveResult.data ?? []).map((l: any) => {
    const start = new Date(l.start_date);
    const end = new Date(l.end_date);
    const fmt = (d: Date) => `${monthName(d.getMonth() + 1)} ${d.getDate()}`;
    return {
      id: l.id,
      type: "leave" as const,
      period: `${fmt(start)} – ${fmt(end)}`,
      status: l.status,
      amountLabel: `${(l.total_hours ?? 0).toFixed(1)} hrs (${l.leave_type})`,
      submittedAt: l.submitted_at,
      user: { id: l.employee?.id, display_name: l.employee?.display_name ?? "—", email: l.employee?.email ?? "", department: l.employee?.department },
      href: `/leave/${l.id}`,
    };
  });

  const items = [...expenses, ...timesheets, ...leaves].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Approvals Inbox" />
      <div className="flex-1 overflow-hidden">
        <ApprovalsInbox items={items} managerId={user!.id} userRole={role as "manager" | "finance" | "admin"} />
      </div>
    </div>
  );
}

function monthName(m: number) {
  return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] ?? "";
}
