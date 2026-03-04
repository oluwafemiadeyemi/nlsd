import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile }: any = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  if (profile?.role === "employee") redirect("/dashboard");

  const currentYear = new Date().getFullYear();

  const [tsStats, exStats]: any[] = await Promise.all([
    supabase
      .from("timesheet_weeks" as any)
      .select("status, total_hours, year, week_number")
      .eq("year", currentYear),
    supabase
      .from("expense_weeks" as any)
      .select("status, weekly_total, year, week_number")
      .eq("year", currentYear),
  ]);

  const ts: any[] = tsStats.data ?? [];
  const ex: any[] = exStats.data ?? [];

  const tsSummary = {
    total: ts.length,
    approved: ts.filter((t) => t.status === "approved").length,
    pending: ts.filter((t) => t.status === "submitted").length,
    totalHours: ts.reduce((s, t) => s + (t.total_hours || 0), 0),
  };

  const exSummary = {
    total: ex.length,
    approved: ex.filter((e) => e.status === "approved").length,
    pending: ex.filter((e) => e.status === "submitted").length,
    totalAmount: ex
      .filter((e) => e.status === "approved")
      .reduce((s, e) => s + (e.weekly_total || 0), 0),
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

          <div className="rounded-xl border border-border p-6 text-center text-muted-foreground">
            <p className="text-sm">
              Detailed reports with export capabilities are available in the full release.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
