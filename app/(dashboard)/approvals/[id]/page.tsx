import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ApprovalDetailClient } from "@/components/approvals/ApprovalDetailClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Approval Detail" };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}

export default async function ApprovalDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { type } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = await getCurrentUserRole();
  if (role === "employee") redirect("/dashboard");

  if (!type || !["timesheet", "expense", "leave"].includes(type)) {
    notFound();
  }

  if (type === "timesheet") {
    const { data, error } = await (supabase.from as any)("timesheets")
      .select(`
        id, employee_id, year, month, week_number, status, submitted_at, employee_notes, manager_comments,
        employee:profiles!employee_id(id, display_name, email, department),
        timesheet_rows(
          id, billing_type_id, project_id, sun, mon, tue, wed, thu, fri, sat, weekly_total,
          billing_type:billing_types(name),
          project:projects(code, title)
        )
      `)
      .eq("id", id)
      .single();
    if (error || !data) notFound();

    if (data.week_number === 0) {
      const { data: weeklyRows }: any = await (supabase.from as any)("timesheets")
        .select(`
          timesheet_rows(
            id, billing_type_id, project_id, sun, mon, tue, wed, thu, fri, sat, weekly_total,
            billing_type:billing_types(name),
            project:projects(code, title)
          )
        `)
        .eq("employee_id", data.employee_id)
        .eq("year", data.year)
        .eq("month", data.month)
        .gt("week_number", 0)
        .order("week_number");

      data.timesheet_rows = (weeklyRows ?? []).flatMap((row: any) => row.timesheet_rows ?? []);
    }

    return (
      <div className="flex flex-col h-full">
        <TopBar title="Timesheet Approval" />
        <div className="flex-1 overflow-y-auto p-6">
          <ApprovalDetailClient
            type="timesheet"
            data={data}
            userId={user!.id}
            userRole={role as "manager" | "finance" | "admin"}
          />
        </div>
      </div>
    );
  }

  if (type === "expense") {
    const { data, error } = await (supabase.from as any)("expense_reports")
      .select(`
        id, year, month, week_number, destination, status, submitted_at, employee_notes, manager_comments,
        employee:profiles!employee_id(id, display_name, email, department),
        expense_entries(day_index, entry_date, travel_from, travel_to, mileage_km, mileage_cost,
          lodging_amount, breakfast_amount, lunch_amount, dinner_amount, other_amount, other_note, notes)
      `)
      .eq("id", id)
      .single();
    if (error || !data) notFound();

    return (
      <div className="flex flex-col h-full">
        <TopBar title="Expense Approval" />
        <div className="flex-1 overflow-y-auto p-6">
          <ApprovalDetailClient
            type="expense"
            data={data}
            userId={user!.id}
            userRole={role as "manager" | "finance" | "admin"}
          />
        </div>
      </div>
    );
  }

  // type === "leave"
  const { data, error } = await (supabase.from as any)("leave_requests")
    .select(`
      id, leave_type, start_date, end_date, hours_per_day, total_hours, status,
      submitted_at, employee_notes, manager_comments, attachment_path,
      employee:profiles!employee_id(id, display_name, email, department)
    `)
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Leave Approval" />
      <div className="flex-1 overflow-y-auto p-6">
        <ApprovalDetailClient
          type="leave"
          data={data}
          userId={user!.id}
          userRole={role as "manager" | "finance" | "admin"}
        />
      </div>
    </div>
  );
}
