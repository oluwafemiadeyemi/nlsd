import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { CsvExportButtons } from "@/components/reports/CsvExportButtons";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getCurrentUserRole();
  if (role === "employee") redirect("/dashboard");

  const currentYear = new Date().getFullYear();

  const [tsResult, exResult]: any[] = await Promise.all([
    supabase
      .from("timesheets")
      .select("id, status, year, week_number, timesheet_rows(weekly_total)")
      .eq("year", currentYear),
    supabase
      .from("expense_reports")
      .select("id, status, year, week_number, expense_entries(mileage_cost_claimed, lodging_amount, breakfast_amount, lunch_amount, dinner_amount, other_amount)")
      .eq("year", currentYear),
  ]);

  const ts: any[] = tsResult.data ?? [];
  const ex: any[] = exResult.data ?? [];

  const tsSummary = {
    total: ts.length,
    approved: ts.filter((t) => t.status === "approved" || t.status === "manager_approved").length,
    pending: ts.filter((t) => t.status === "submitted").length,
    totalHours: ts.reduce((s, t) => {
      const hours = (t.timesheet_rows ?? []).reduce((h: number, r: any) => h + (r.weekly_total ?? 0), 0);
      return s + hours;
    }, 0),
  };

  const exSummary = {
    total: ex.length,
    approved: ex.filter((e) => e.status === "approved" || e.status === "manager_approved").length,
    pending: ex.filter((e) => e.status === "submitted").length,
    totalAmount: ex
      .filter((e) => e.status === "approved")
      .reduce((s, e) => {
        const total = (e.expense_entries ?? []).reduce(
          (t: number, en: any) =>
            t + (en.mileage_cost_claimed ?? 0) + (en.lodging_amount ?? 0) +
            (en.breakfast_amount ?? 0) + (en.lunch_amount ?? 0) +
            (en.dinner_amount ?? 0) + (en.other_amount ?? 0),
          0
        );
        return s + total;
      }, 0),
  };

  const stats = [
    { label: "Timesheets This Year", value: tsSummary.total, sub: `${tsSummary.approved} approved` },
    { label: "Total Hours Logged", value: `${tsSummary.totalHours.toFixed(0)}h`, sub: `${tsSummary.pending} pending review` },
    { label: "Expense Claims This Year", value: exSummary.total, sub: `${exSummary.approved} approved` },
    { label: "Total Expenses Approved", value: formatCurrency(exSummary.totalAmount), sub: `${exSummary.pending} pending review` },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Reports" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-xl font-semibold">{currentYear} Summary</h2>
            <p className="text-sm text-muted-foreground mt-1">Organisation-wide statistics</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border p-6">
            <h3 className="font-semibold text-sm mb-3">Export Data</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Download {currentYear} timesheet or expense data as CSV for payroll processing.
            </p>
            <CsvExportButtons year={currentYear} />
          </div>
        </div>
      </div>
    </div>
  );
}
