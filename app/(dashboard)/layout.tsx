import { createServerSupabaseClient, getCurrentUserRole } from "@/lib/supabase/server";
import { TopNav } from "@/components/layout/TopNav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: any = null;
  let role: "employee" | "manager" | "admin" = "employee";
  let pendingApprovals = 0;

  if (user) {
    const [profRes, userRole]: any[] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, email, avatar_url")
        .eq("id", user.id)
        .single(),
      getCurrentUserRole(),
    ]);
    profile = profRes.data;
    role = userRole;

    // Count pending approvals for managers/admins/finance
    if (role === "manager" || role === "admin" || role === "finance") {
      const [ts, ex] = await Promise.all([
        supabase
          .from("timesheets")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase
          .from("expense_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ]);
      pendingApprovals = (ts.count ?? 0) + (ex.count ?? 0);
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TopNav
        role={role}
        pendingApprovals={pendingApprovals}
        userName={profile?.display_name ?? user?.email ?? "Guest"}
        userEmail={profile?.email ?? user?.email ?? ""}
        userAvatar={profile?.avatar_url ?? undefined}
      />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
