import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { format } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit Log" };

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: "Created", color: "text-blue-600 bg-blue-50" },
  update: { label: "Updated", color: "text-slate-600 bg-slate-50" },
  submit: { label: "Submitted", color: "text-indigo-600 bg-indigo-50" },
  approve: { label: "Approved", color: "text-emerald-600 bg-emerald-50" },
  reject: { label: "Rejected", color: "text-red-600 bg-red-50" },
  delete: { label: "Deleted", color: "text-red-600 bg-red-50" },
  sync_success: { label: "Sync OK", color: "text-emerald-600 bg-emerald-50" },
  sync_failed: { label: "Sync Failed", color: "text-red-600 bg-red-50" },
};

const ENTITY_LABELS: Record<string, string> = {
  timesheet: "Timesheet",
  expense_report: "Expense",
  leave_request: "Leave",
  project: "Project",
  billing_type: "Billing Type",
  hours_config: "Hours Config",
  mileage_rate: "Mileage Rate",
  directory_sync: "Directory Sync",
  sharepoint_sync: "SharePoint Sync",
};

export default async function AuditLogPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createServerSupabaseClient();

  const { data: entries }: any = await supabase
    .from("audit_log")
    .select("*, actor:profiles!actor_user_id(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Audit Log" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Showing the most recent 200 audit events across all entities.
            </p>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entity</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(entries ?? []).map((e: any) => {
                  const act = ACTION_LABELS[e.action] ?? { label: e.action, color: "text-slate-600 bg-slate-50" };
                  return (
                    <tr key={e.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(e.created_at), "MMM d, h:mm a")}
                      </td>
                      <td className="px-4 py-3">
                        {e.actor?.display_name ?? "System"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${act.color}`}>
                          {act.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ENTITY_LABELS[e.entity_type] ?? e.entity_type}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                        {e.comment ?? "—"}
                      </td>
                    </tr>
                  );
                })}
                {(!entries || entries.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No audit entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
