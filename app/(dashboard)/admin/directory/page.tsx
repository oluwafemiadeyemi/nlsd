import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import DirectoryPanel from "@/components/admin/DirectoryPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Employee Directory" };

export default async function DirectoryPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createServerSupabaseClient();

  const { data: people }: any = await supabase
    .from("profiles")
    .select(`
      id, display_name, email, department, job_title, avatar_url,
      user_roles(role),
      employee_manager!employee_manager_employee_id_fkey(
        manager:profiles!employee_manager_manager_id_fkey(id, display_name)
      )
    `)
    .order("display_name");

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Employee Directory" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <DirectoryPanel people={people ?? []} />
        </div>
      </div>
    </div>
  );
}
