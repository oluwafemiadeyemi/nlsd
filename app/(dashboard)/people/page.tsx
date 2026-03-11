import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const { data: people }: any = await supabase
    .from("profiles")
    .select(`
      id, display_name, email, department, job_title,
      user_roles(role),
      employee_manager!employee_manager_employee_id_fkey(
        manager:profiles!employee_manager_manager_id_fkey(display_name)
      )
    `)
    .order("display_name");

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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(people ?? []).map((p: any) => {
                  const roles = (p.user_roles ?? []).map((r: any) => r.role).join(", ");
                  const managerName = p.employee_manager?.[0]?.manager?.display_name;
                  return (
                    <tr key={p.id} className="hover:bg-accent/30 transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <Link href={`/admin/employees/${p.id}`} className="font-medium hover:text-primary hover:underline">
                          {p.display_name ?? "—"}
                        </Link>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                        {p.job_title && <div className="text-xs text-muted-foreground">{p.job_title}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.department ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-sm">{roles || "employee"}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {managerName ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
