import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ExpensePeriodForm } from "@/components/expenses/ExpensePeriodForm";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  EXPENSE_MONTH_NAMES,
  currentExpensePeriod,
  formatExpensePeriodLabel,
} from "@/domain/expenses/period";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Expenses" };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const rawYear = sp.year ? Number.parseInt(sp.year, 10) : now.getFullYear();
  const rawMonth = sp.month ? Number.parseInt(sp.month, 10) : now.getMonth() + 1;
  const filterYear = clamp(Number.isFinite(rawYear) ? rawYear : now.getFullYear(), 2000, 2100);
  const filterMonth = clamp(Number.isFinite(rawMonth) ? rawMonth : now.getMonth() + 1, 1, 12);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: reports }: any = await supabase
    .from("expense_reports")
    .select("id, year, month, week_number, week_beginning_date, destination, status, submitted_at, approved_at")
    .eq("employee_id", user.id)
    .eq("year", filterYear)
    .eq("month", filterMonth)
    .order("week_number", { ascending: false });

  const currentPeriod = currentExpensePeriod(now);
  const prevMonth = filterMonth === 1 ? 12 : filterMonth - 1;
  const prevYear = filterMonth === 1 ? filterYear - 1 : filterYear;
  const nextMonth = filterMonth === 12 ? 1 : filterMonth + 1;
  const nextYear = filterMonth === 12 ? filterYear + 1 : filterYear;
  const isCurrentMonth = filterYear === now.getFullYear() && filterMonth === now.getMonth() + 1;

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Expenses"
        actions={
          <Link
            href={`/expenses/new?year=${currentPeriod.year}&month=${currentPeriod.month}&week=${currentPeriod.weekNumber}`}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + New Week
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-center justify-between">
            <Link
              href={`/expenses?month=${prevMonth}&year=${prevYear}`}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">
                {EXPENSE_MONTH_NAMES[filterMonth - 1]} {filterYear}
              </h2>
              {!isCurrentMonth && (
                <Link href="/expenses" className="text-xs text-primary hover:underline">
                  Back to current month
                </Link>
              )}
            </div>

            <Link
              href={`/expenses?month=${nextMonth}&year=${nextYear}`}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          <ExpensePeriodForm
            defaultYear={filterYear}
            defaultMonth={filterMonth}
            defaultWeekNumber={currentPeriod.weekNumber}
          />

          {!reports?.length ? (
            <div className="py-16 text-center">
              <p className="mb-4 text-muted-foreground">
                No expense claims for {EXPENSE_MONTH_NAMES[filterMonth - 1]} {filterYear}.
              </p>
              <Link
                href={`/expenses/new?year=${currentPeriod.year}&month=${currentPeriod.month}&week=${currentPeriod.weekNumber}`}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Create a new claim
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((report: any) => (
                    <tr key={report.id} className="transition-colors hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {formatExpensePeriodLabel({
                            year: report.year,
                            month: report.month,
                            weekNumber: report.week_number,
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{report.destination ?? "â€”"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/expenses/${report.id}`} className="text-sm text-primary hover:underline">
                          {report.status === "draft" ? "Edit" : "View"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
