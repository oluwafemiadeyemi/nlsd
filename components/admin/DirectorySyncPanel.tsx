"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Users, Shield, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  users_fetched: number;
  profiles_provisioned: number;
  profiles_updated: number;
  manager_links_upserted: number;
  role_grants_upserted: number;
  roles_removed: number;
  progress_status: string | null;
  error: string | null;
}

interface DirectorySyncPanelProps {
  runs: SyncRun[];
  activeUserCount: number;
  roleMappingCount: number;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; className: string; label: string }> = {
  success: { icon: CheckCircle, className: "text-emerald-600", label: "Success" },
  failed: { icon: XCircle, className: "text-red-500", label: "Failed" },
  running: { icon: RefreshCw, className: "text-blue-500", label: "Running" },
};

export function DirectorySyncPanel({ runs: initialRuns, activeUserCount, roleMappingCount }: DirectorySyncPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState(initialRuns);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/directory-sync/status");
      if (!res.ok) return;
      const data = await res.json();
      if (data.runs) {
        setRuns(data.runs);
        const running = data.runs.find((r: SyncRun) => r.status === "running");
        if (running) {
          setProgressStatus(running.progress_status ?? "Syncing...");
        } else {
          setProgressStatus(null);
          stopPolling();
        }
      }
    } catch {
      // ignore polling errors
    }
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleSyncNow() {
    setSyncing(true);
    setProgressStatus("Starting sync...");

    // Start polling every 2 seconds
    pollingRef.current = setInterval(pollProgress, 2000);

    try {
      const res = await fetch("/api/admin/directory-sync/run", {
        method: "POST",
      });
      let result: any;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Sync endpoint returned non-JSON response (HTTP ${res.status}).`);
      }

      if (result.ok) {
        toast({
          title: "Sync complete",
          description: `${result.profilesProvisioned ?? 0} provisioned, ${result.profilesUpdated ?? 0} updated, ${result.rolesRemoved ?? 0} roles removed.`,
          variant: "success",
        });
        router.refresh();
      } else {
        throw new Error(result.error ?? `HTTP ${res.status}`);
      }
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
      setProgressStatus(null);
      stopPolling();
      // Final poll to get latest data
      await pollProgress();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">Directory Sync</h2>
          <p className="text-sm text-muted-foreground">
            Syncs user profiles, roles, and manager assignments from Microsoft Entra ID.
            Runs automatically at 2:00am UTC every day.
          </p>
        </div>
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      {/* Progress indicator */}
      {syncing && progressStatus && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-800">
          <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
          <span className="text-sm font-medium">{progressStatus}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Profiles</span>
          </div>
          <p className="text-2xl font-bold">{activeUserCount}</p>
        </div>
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role Assignments</span>
          </div>
          <p className="text-2xl font-bold">{roleMappingCount}</p>
        </div>
      </div>

      {/* Run history */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Sync Run History</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No sync runs yet. Click &ldquo;Sync Now&rdquo; to trigger the first sync.
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Users</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">New</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Updated</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Managers</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Grants</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Removed</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => {
                    const cfg = STATUS_CONFIG[run.status] ?? {
                      icon: Clock,
                      className: "text-muted-foreground",
                      label: run.status,
                    };
                    const Icon = cfg.icon;
                    return (
                      <tr key={run.id} className="hover:bg-accent/30">
                        <td className="px-4 py-2.5">
                          <span className={cn("flex items-center gap-1.5 text-xs font-medium", cfg.className)}>
                            <Icon className={cn("w-3.5 h-3.5", run.status === "running" && "animate-spin")} />
                            {cfg.label}
                          </span>
                          {run.status === "running" && run.progress_status && (
                            <div className="text-xs text-muted-foreground mt-0.5">{run.progress_status}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(run.started_at), "MMM d, yyyy 'at' h:mm a")}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums">{run.users_fetched}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums">{run.profiles_provisioned ?? 0}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums">{run.profiles_updated}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums">{run.manager_links_upserted}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums">{run.role_grants_upserted}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums">{run.roles_removed}</td>
                        <td className="px-4 py-2.5 text-xs text-red-500 max-w-[200px] truncate" title={run.error ?? undefined}>
                          {run.error ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
