import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile }: any = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: people }: any = await supabase
    .from("profiles")
    .select("id, full_name, email, department, role, is_active, job_title, manager:profiles!manager_id(full_name)")
    .order("full_name");

  return (
    <div className="flex flex-col h-full">
      <TopBar title="People" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Manager</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(people ?? []).map((p: any) => (
                  <tr key={p.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                      {p.job_title && <div className="text-xs text-muted-foreground">{p.job_title}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-sm">{p.role}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(p.manager as any)?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
