import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import Link from "next/link";
import { Users, Share2, HeartPulse, CheckCircle, XCircle, Clock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createServerSupabaseClient();

  // SharePoint sync stats (uses last_status column)
  const [syncSuccess, syncFailed, syncPending, healthMetrics]: any[] = await Promise.all([
    supabase.from("sharepoint_sync").select("id", { count: "exact", head: true }).eq("last_status", "success"),
    supabase.from("sharepoint_sync").select("id", { count: "exact", head: true }).eq("last_status", "failed"),
    supabase.from("sharepoint_sync").select("id", { count: "exact", head: true }).is("last_status", null),
    supabase.from("v_directory_health_metrics" as any).select("missing_identity_count, missing_manager_count, managers_without_role_count").single(),
  ]);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Admin" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-1">Administration</h2>
            <p className="text-sm text-muted-foreground">Manage directory sync, SharePoint integration, and system health.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/admin/directory-sync"
              className="group p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">Directory Sync</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Sync users, roles, and manager relationships from Microsoft Entra ID.
                    Runs automatically at 2am UTC daily.
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/sharepoint-sync"
              className="group p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">SharePoint Sync</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    View export logs, retry failed exports, and monitor SharePoint integration health.
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle className="w-3.5 h-3.5" /> {syncSuccess.count ?? 0} success
                    </span>
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="w-3.5 h-3.5" /> {syncFailed.count ?? 0} failed
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" /> {syncPending.count ?? 0} pending
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/directory-health"
              className="group p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">Directory Health</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Detect missing emails, duplicate employee numbers, and broken approval routing.
                  </p>
                  {(healthMetrics.data?.missing_identity_count ?? 0) > 0 || (healthMetrics.data?.missing_manager_count ?? 0) > 0 ? (
                    <div className="flex items-center gap-3 mt-2">
                      {(healthMetrics.data?.missing_identity_count ?? 0) > 0 && (
                        <span className="text-xs text-amber-600">
                          {healthMetrics.data!.missing_identity_count} missing identity
                        </span>
                      )}
                      {(healthMetrics.data?.missing_manager_count ?? 0) > 0 && (
                        <span className="text-xs text-amber-600">
                          {healthMetrics.data!.missing_manager_count} missing manager
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs text-emerald-600">No issues detected</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
