import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { DirectoryHealthPanel } from "@/components/admin/DirectoryHealthPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Directory Health" };

export default async function DirectoryHealthPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createServerSupabaseClient();

  const [metricsRes, missingIdentityRes, missingManagerRes, dupEmpNoRes, mgrNoRoleRes]: any[] =
    await Promise.all([
      supabase.from("v_directory_health_metrics" as any).select("*").single(),
      supabase.from("v_directory_missing_identity" as any).select("*").order("updated_at", { ascending: false }).limit(100),
      supabase.from("v_directory_missing_manager" as any).select("*").order("updated_at", { ascending: false }).limit(100),
      supabase.from("v_directory_duplicate_employee_number" as any).select("*").order("occurrences", { ascending: false }).limit(100),
      supabase.from("v_directory_managers_without_role" as any).select("*").order("direct_reports_count", { ascending: false }).limit(100),
    ]);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Directory Health" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <DirectoryHealthPanel
            metrics={metricsRes.data as any}
            missingIdentity={missingIdentityRes.data ?? []}
            missingManager={missingManagerRes.data ?? []}
            duplicateEmployeeNumber={dupEmpNoRes.data ?? []}
            managersWithoutRole={mgrNoRoleRes.data ?? []}
          />
        </div>
      </div>
    </div>
  );
}
