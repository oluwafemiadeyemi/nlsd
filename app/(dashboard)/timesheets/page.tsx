import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Timesheets" };

/** Week-within-month (1-5) from today's date */
function currentPeriod() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    week: Math.min(Math.ceil(now.getDate() / 7), 5),
  };
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function TimesheetsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: timesheets }: any = user
    ? await supabase
        .from("timesheets")
        .select("id, year, month, week_number, status, submitted_at, approved_at")
        .eq("employee_id", user.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("week_number", { ascending: false })
    : { data: [] };

  const { year, month, week } = currentPeriod();

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Timesheets"
        actions={
          <Link
            href={`/timesheets/new?year=${year}&month=${month}&week=${week}`}
            className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            + New Week
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {!timesheets?.length ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground mb-4">No timesheets yet.</p>
              <Link
                href={`/timesheets/new?year=${year}&month=${month}&week=${week}`}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                Create your first timesheet
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timesheets.map((ts: any) => (
                    <tr key={ts.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {MONTH_NAMES[ts.month]} {ts.year} — Week {ts.week_number}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={ts.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/timesheets/${ts.id}`}
                          className="text-primary hover:underline text-sm"
                        >
                          {ts.status === "draft" ? "Edit" : "View"}
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
