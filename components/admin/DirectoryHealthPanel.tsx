"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Wand2, RouteOff, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Metrics {
  total_profiles: number;
  profiles_with_azure_id: number;
  profiles_with_email: number;
  employees_with_manager: number;
  missing_identity_count: number;
  missing_manager_count: number;
  duplicate_employee_number_count: number;
  managers_without_role_count: number;
}

interface DirectoryHealthPanelProps {
  metrics: Metrics | null;
  missingIdentity: any[];
  missingManager: any[];
  duplicateEmployeeNumber: any[];
  managersWithoutRole: any[];
}

type TabKey = "overview" | "missingIdentity" | "missingManager" | "dupEmpNo" | "mgrNoRole";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "missingIdentity", label: "Missing identity" },
  { key: "missingManager", label: "Missing manager" },
  { key: "dupEmpNo", label: "Duplicate employee #" },
  { key: "mgrNoRole", label: "Managers without role" },
];

export function DirectoryHealthPanel({
  metrics,
  missingIdentity,
  missingManager,
  duplicateEmployeeNumber,
  managersWithoutRole,
}: DirectoryHealthPanelProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [autoManaging, setAutoManaging] = useState(false);
  const [rerouting, setRerouting] = useState<false | "missing" | "override">(false);
  const router = useRouter();
  const supabase = createClient();

  const m = metrics ?? {
    total_profiles: 0,
    profiles_with_azure_id: 0,
    profiles_with_email: 0,
    employees_with_manager: 0,
    missing_identity_count: 0,
    missing_manager_count: 0,
    duplicate_employee_number_count: 0,
    managers_without_role_count: 0,
  };

  const pct = (num: number, den: number) =>
    den === 0 ? 0 : Math.round((num / den) * 100);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");
    return session.access_token;
  }

  async function handleAutoManagerRoles() {
    setAutoManaging(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/auto-manager-roles?keepAdminAsManager=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      let result: any;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Auto-manager endpoint returned non-JSON response (HTTP ${res.status}).`);
      }
      if (!result.ok) throw new Error(result.error);
      toast({
        title: "Manager roles updated",
        description: `Added ${result.added}, removed ${result.removed} manager role(s).`,
        variant: "success",
      });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setAutoManaging(false);
    }
  }

  async function handleReroute(override: boolean) {
    setRerouting(override ? "override" : "missing");
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/reroute-submitted-approvals?override=${override}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      let result: any;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Reroute endpoint returned non-JSON response (HTTP ${res.status}).`);
      }
      if (!result.ok) throw new Error(result.error);
      toast({
        title: "Approvals re-routed",
        description: `${result.timesheetsRerouted} timesheet(s) + ${result.expensesRerouted} expense(s) updated.`,
        variant: "success",
      });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setRerouting(false);
    }
  }

  function downloadCsv(data: any[], filename: string) {
    if (!data.length) {
      toast({ title: "Nothing to export", description: "No rows in this list.", variant: "destructive" });
      return;
    }
    const keys = Object.keys(data[0]);
    const escape = (v: unknown) => {
      const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      keys.join(","),
      ...data.map((r) => keys.map((k) => escape(r[k])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabData: Record<TabKey, any[]> = {
    overview: [],
    missingIdentity,
    missingManager,
    dupEmpNo: duplicateEmployeeNumber,
    mgrNoRole: managersWithoutRole,
  };

  const tabFilenames: Record<TabKey, string> = {
    overview: "overview",
    missingIdentity: "missing_identity",
    missingManager: "missing_manager",
    dupEmpNo: "duplicate_employee_number",
    mgrNoRole: "managers_without_role",
  };

  const anyIssues =
    m.missing_identity_count > 0 ||
    m.missing_manager_count > 0 ||
    m.duplicate_employee_number_count > 0 ||
    m.managers_without_role_count > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">Directory Health</h2>
          <p className="text-sm text-muted-foreground">
            Quality checks that directly affect approvals, reporting, and payroll exports.
          </p>
        </div>
        {anyIssues && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Issues detected
          </span>
        )}
      </div>

      {/* Coverage metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="Azure ID coverage"
          value={`${pct(m.profiles_with_azure_id, m.total_profiles)}%`}
          subtitle={`${m.profiles_with_azure_id} / ${m.total_profiles} profiles`}
        />
        <MetricCard
          title="Email coverage"
          value={`${pct(m.profiles_with_email, m.total_profiles)}%`}
          subtitle={`${m.profiles_with_email} / ${m.total_profiles} profiles`}
        />
        <MetricCard
          title="Manager coverage"
          value={`${pct(m.employees_with_manager, m.total_profiles)}%`}
          subtitle={`${m.employees_with_manager} / ${m.total_profiles} employees`}
        />
      </div>

      {/* Issue count cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard title="Missing identity" value={String(m.missing_identity_count)} subtitle="No email or Azure ID" warn={m.missing_identity_count > 0} />
        <MetricCard title="Missing manager" value={String(m.missing_manager_count)} subtitle="No manager mapping" warn={m.missing_manager_count > 0} />
        <MetricCard title="Duplicate emp. #" value={String(m.duplicate_employee_number_count)} subtitle="Number collisions" warn={m.duplicate_employee_number_count > 0} />
        <MetricCard title="Managers w/o role" value={String(m.managers_without_role_count)} subtitle="Has reports, no role" warn={m.managers_without_role_count > 0} />
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {tab !== "overview" && (
          <button
            onClick={() => downloadCsv(tabData[tab], tabFilenames[tab])}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}

        <div className="mx-2 h-5 w-px bg-border" />

        <button
          onClick={handleAutoManagerRoles}
          disabled={autoManaging}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {autoManaging ? "Updating…" : "Auto-assign manager roles"}
        </button>

        <button
          onClick={() => handleReroute(false)}
          disabled={rerouting !== false}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          title="Only updates submitted items where manager_id is missing"
        >
          <RouteOff className="w-3.5 h-3.5" />
          {rerouting === "missing" ? "Re-routing…" : "Re-route submitted (missing)"}
        </button>

        <button
          onClick={() => handleReroute(true)}
          disabled={rerouting !== false}
          className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
          title="Overrides existing manager_id for all submitted items"
        >
          <RouteOff className="w-3.5 h-3.5" />
          {rerouting === "override" ? "Re-routing…" : "Re-route submitted (override all)"}
        </button>
      </div>

      {/* Panels */}
      {tab === "overview" && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-medium mb-3">How to improve directory health</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Every employee needs an Entra ID account with a valid email or userPrincipalName.</li>
            <li>• Managers must be set in Entra's org chart. Missing managers break approval routing.</li>
            <li>• Employee numbers (employeeId) must be unique. Duplicates break payroll matching.</li>
            <li>• Use "Auto-assign manager roles" after a directory sync to fix role gaps automatically.</li>
            <li>• Use "Re-route submitted (missing)" after fixing managers to repair in-flight approvals.</li>
          </ul>
        </div>
      )}

      {tab === "missingIdentity" && (
        <IssueTable title="Profiles missing email or Azure ID" rows={missingIdentity} />
      )}
      {tab === "missingManager" && (
        <IssueTable title="Employees missing manager mapping" rows={missingManager} />
      )}
      {tab === "dupEmpNo" && (
        <IssueTable title="Duplicate employee number groups" rows={duplicateEmployeeNumber} />
      )}
      {tab === "mgrNoRole" && (
        <IssueTable title="People with direct reports but no manager role" rows={managersWithoutRole} />
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  warn,
}: {
  title: string;
  value: string;
  subtitle?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "p-4 rounded-2xl border",
        warn ? "border-amber-200/60 bg-amber-500/5" : "border-border bg-card"
      )}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <p className={cn("text-3xl font-semibold tabular-nums", warn && "text-amber-700")}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function IssueTable({ title, rows }: { title: string; rows: any[] }) {
  const keys = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2">
        <p className="text-sm font-medium">{title}</p>
        <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
          {rows.length} row{rows.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {keys.map((k) => (
                <th
                  key={k}
                  className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, idx) => (
              <tr key={idx} className="hover:bg-accent/30">
                {keys.map((k) => (
                  <td key={k} className="px-4 py-2.5 align-top text-xs">
                    <CellValue value={r[k]} />
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                  colSpan={keys.length || 1}
                >
                  No issues found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <span>{value.join(", ")}</span>;
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span>{String(value)}</span>;
}
