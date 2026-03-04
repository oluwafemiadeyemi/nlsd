import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const currentYear = new Date().getFullYear();
  const emptySingle = { data: null };

  const [role, hoursResult, mileageResult, projectsResult]: any[] = user ? await Promise.all([
    getCurrentUserRole(),
    supabase.from("hours_config" as any).select("contracted_hours, maximum_hours").eq("employee_id", user.id).single(),
    supabase.from("mileage_rate_config" as any).select("rate_per_km, year").eq("employee_id", user.id).eq("year", currentYear).single(),
    supabase.from("projects").select("id, code, title, active").order("title"),
  ]) : ["employee", emptySingle, emptySingle, { data: [] }];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Settings" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <SettingsTabs
            hoursConfig={{
              contracted_hours: hoursResult.data?.contracted_hours ?? 40,
              maximum_hours: hoursResult.data?.maximum_hours ?? 60,
            }}
            mileageRate={{
              rate_per_km: mileageResult.data?.rate_per_km ?? 0.61,
              year: mileageResult.data?.year ?? currentYear,
            }}
            projects={projectsResult.data ?? []}
            userId={user?.id ?? "guest"}
            userRole={role}
            isAdmin={role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}
