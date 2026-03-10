"use client";

import { useState, useMemo } from "react";
import { Users, Building2, Shield, Search } from "lucide-react";

type Person = {
  id: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  avatar_url: string | null;
  user_roles: { role: string }[];
  employee_manager: { manager: { display_name: string | null } | null }[];
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  finance: "bg-emerald-100 text-emerald-700",
  manager: "bg-blue-100 text-blue-700",
};

export default function DirectoryPanel({ people }: { people: Person[] }) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      if (p.department) set.add(p.department);
    }
    return Array.from(set).sort();
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return people.filter((p) => {
      if (deptFilter !== "all" && p.department !== deptFilter) return false;
      if (!q) return true;
      return (
        (p.display_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q) ||
        (p.job_title ?? "").toLowerCase().includes(q)
      );
    });
  }, [people, search, deptFilter]);

  const roleCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of people) {
      for (const r of p.user_roles) {
        map[r.role] = (map[r.role] ?? 0) + 1;
      }
    }
    return map;
  }, [people]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Employees
            </span>
          </div>
          <p className="text-2xl font-bold">{people.length}</p>
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
            <Shield className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Roles Assigned
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {Object.entries(roleCount).map(([role, count]) => (
              <span key={role} className="text-sm">
                <span className="font-bold">{count}</span>{" "}
                <span className="text-muted-foreground capitalize">{role}</span>
              </span>
            ))}
            {Object.keys(roleCount).length === 0 && (
              <span className="text-sm text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, department, or title..."
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
        Showing {filtered.length} of {people.length} employees
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
                Role
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
                  No employees found.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const roles = p.user_roles.map((r) => r.role);
              const managerName = p.employee_manager?.[0]?.manager?.display_name;
              return (
                <tr key={p.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-muted-foreground">
                            {(p.display_name ?? "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{p.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.email ?? "—"}</div>
                        {p.job_title && (
                          <div className="text-xs text-muted-foreground">{p.job_title}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.department ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {roles.length > 0 ? (
                        roles.map((role) => (
                          <span
                            key={role}
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700"}`}
                          >
                            {role}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">employee</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{managerName ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
