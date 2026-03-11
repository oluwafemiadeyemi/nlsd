"use client";

import Link from "next/link";
import { Building2, MapPin, Clock, Hash, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  office_location: string | null;
  avatar_url: string | null;
  employee_number: string | null;
  created_at: string;
};

type Props = {
  profile: Profile;
  roles: string[];
  manager: { id: string; display_name: string | null } | null;
  directReports: Array<{ id: string; display_name: string | null }>;
  hoursConfig: { contracted_hours: number; maximum_hours: number } | null;
  recentTimesheets: Array<{
    id: string;
    year: number;
    week_number: number;
    status: string;
    total_hours: number | null;
  }>;
  recentExpenses: Array<{
    id: string;
    title: string | null;
    status: string;
    weekly_total: number | null;
  }>;
  recentLeave: Array<{
    id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    status: string;
  }>;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  manager_approved: "bg-emerald-100 text-emerald-700",
  finance_approved: "bg-emerald-100 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-700",
  manager_rejected: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize",
        STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"
      )}
    >
      {label}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-violet-100 text-violet-700",
    manager: "bg-blue-100 text-blue-700",
    finance: "bg-amber-100 text-amber-700",
    employee: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize",
        colors[role] ?? "bg-gray-100 text-gray-700"
      )}
    >
      {role}
    </span>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function EmployeeProfilePanel({
  profile,
  roles,
  manager,
  directReports,
  hoursConfig,
  recentTimesheets,
  recentExpenses,
  recentLeave,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-5">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name ?? "Avatar"}
            className="w-20 h-20 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-semibold text-muted-foreground">
              {initials(profile.display_name)}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">
            {profile.display_name ?? "—"}
          </h2>
          {profile.job_title && (
            <p className="text-sm text-muted-foreground">{profile.job_title}</p>
          )}
          {profile.email && (
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {roles.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Department
            </span>
          </div>
          <p className="font-medium text-sm">{profile.department ?? "—"}</p>
          {profile.office_location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" /> {profile.office_location}
            </p>
          )}
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Hours Config
            </span>
          </div>
          <p className="font-medium text-sm">
            {hoursConfig?.contracted_hours ?? 40}h contracted
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {hoursConfig?.maximum_hours ?? 60}h maximum
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Employee No.
            </span>
          </div>
          <p className="font-medium text-sm">
            {profile.employee_number ?? "—"}
          </p>
        </div>
      </div>

      {/* Manager & Direct Reports */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Manager
            </span>
          </div>
          {manager ? (
            <Link
              href={`/admin/employees/${manager.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {manager.display_name ?? "—"}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Not assigned</p>
          )}
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Direct Reports ({directReports.length})
            </span>
          </div>
          {directReports.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {directReports.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/employees/${r.id}`}
                  className="text-xs px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  {r.display_name ?? "—"}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">None</p>
          )}
        </div>
      </div>

      {/* Recent Timesheets */}
      <Section title="Recent Timesheets">
        {recentTimesheets.length === 0 ? (
          <EmptyState>No timesheets found</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Week
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Hours
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentTimesheets.map((ts) => (
                <tr key={ts.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground">
                    W{ts.week_number}, {ts.year}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={ts.status} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {ts.total_hours ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Recent Expenses */}
      <Section title="Recent Expenses">
        {recentExpenses.length === 0 ? (
          <EmptyState>No expense reports found</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Report
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground">
                    {exp.title ?? "Untitled"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={exp.status} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    ${(exp.weekly_total ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Recent Leave */}
      <Section title="Recent Leave Requests">
        {recentLeave.length === 0 ? (
          <EmptyState>No leave requests found</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Dates
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentLeave.map((lr) => (
                <tr key={lr.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground capitalize">
                    {lr.leave_type.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lr.start_date} — {lr.end_date}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={lr.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="rounded-xl border border-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
