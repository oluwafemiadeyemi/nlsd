"use client";

import { useState, useMemo } from "react";
import { Users, Building2, MapPin, Search } from "lucide-react";
import Link from "next/link";

type DirectoryMember = {
  id: string;
  azure_user_id: string;
  email: string | null;
  display_name: string | null;
  job_title: string | null;
  department: string | null;
  office_location: string | null;
  employee_id: string | null;
  manager_azure_id: string | null;
  profile_id: string | null;
  synced_at: string;
};

export default function DirectoryPanel({ members }: { members: DirectoryMember[] }) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  // Build a lookup for manager names
  const nameByAzureId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.display_name) map.set(m.azure_user_id, m.display_name);
    }
    return map;
  }, [members]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      if (m.department) set.add(m.department);
    }
    return Array.from(set).sort();
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      if (deptFilter !== "all" && m.department !== deptFilter) return false;
      if (!q) return true;
      return (
        (m.display_name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.department ?? "").toLowerCase().includes(q) ||
        (m.job_title ?? "").toLowerCase().includes(q) ||
        (m.office_location ?? "").toLowerCase().includes(q)
      );
    });
  }, [members, search, deptFilter]);

  const appUserCount = useMemo(
    () => members.filter((m) => m.profile_id).length,
    [members]
  );

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total in Directory
            </span>
          </div>
          <p className="text-2xl font-bold">{members.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {appUserCount} signed into app
          </p>
        </div>
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Departments
            </span>
          </div>
          <p className="text-2xl font-bold">{departments.length}</p>
        </div>
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              With Managers
            </span>
          </div>
          <p className="text-2xl font-bold">
            {members.filter((m) => m.manager_azure_id).length}
          </p>
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, department, title, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {members.length} employees
      </p>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Employee
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Department
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Location
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Manager
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No employees found. Run a directory sync first.
                </td>
              </tr>
            )}
            {filtered.map((m) => {
              const managerName = m.manager_azure_id
                ? nameByAzureId.get(m.manager_azure_id) ?? "—"
                : "—";
              return (
                <tr key={m.id} className={`hover:bg-accent/30 transition-colors ${m.profile_id ? "cursor-pointer" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-muted-foreground">
                          {(m.display_name ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">
                          {m.profile_id ? (
                            <Link href={`/admin/employees/${m.profile_id}`} className="hover:text-primary hover:underline">
                              {m.display_name ?? "—"}
                            </Link>
                          ) : (
                            m.display_name ?? "—"
                          )}
                          {m.profile_id && (
                            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Signed into app" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{m.email ?? "—"}</div>
                        {m.job_title && (
                          <div className="text-xs text-muted-foreground">{m.job_title}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.department ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.office_location ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{managerName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
