import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Expenses" };

function currentWeekNumber(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  return String(Math.ceil(dayOfYear / 7)).padStart(2, "0");
}

export default async function ExpensesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: reports }: any = user
    ? await supabase
        .from("expense_reports")
        .select("id, year, week_number, destination, status, submitted_at, approved_at")
        .eq("employee_id", user.id)
        .order("year", { ascending: false })
        .order("week_number", { ascending: false })
    : { data: [] };

  const year = new Date().getFullYear();
  const week = currentWeekNumber();

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Expenses"
        actions={
          <Link
            href={`/expenses/new?year=${year}&week=${week}`}
            className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            + New Week
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {!reports?.length ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground mb-4">No expense claims yet.</p>
              <Link
                href={`/expenses/new?year=${year}&week=${week}`}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                Create your first claim
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
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
                  {reports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">Week {r.week_number}, {r.year}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.destination ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/expenses/${r.id}`} className="text-primary hover:underline text-sm">
                          {r.status === "draft" ? "Edit" : "View"}
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
