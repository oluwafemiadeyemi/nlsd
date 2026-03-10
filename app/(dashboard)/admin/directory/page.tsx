import { getCurrentUserRole } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import DirectoryPanel from "@/components/admin/DirectoryPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Employee Directory" };

export default async function DirectoryPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/dashboard");

  const adminDb: any = createServiceClient();

  // Supabase defaults to 1000 rows max — paginate to fetch all
  const allMembers: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await adminDb
      .from("directory_members")
      .select("*")
      .not("office_location", "is", null)
      .order("display_name")
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allMembers.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  // Filter out non-person entries (devices, packages, etc.) and sort A-Z
  const members = allMembers
    .filter((m) => {
      const name = (m.display_name ?? "").trim();
      if (!name) return false;
      // Must start with a letter (excludes _Device_, package_, etc.)
      return /^[a-zA-Z]/.test(name);
    })
    .sort((a, b) => {
      const na = (a.display_name ?? "").toLowerCase();
      const nb = (b.display_name ?? "").toLowerCase();
      return na.localeCompare(nb);
    });

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Employee Directory" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <DirectoryPanel members={members ?? []} />
        </div>
      </div>
    </div>
  );
}
