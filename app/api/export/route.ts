import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isFinanceOrAdmin } from "@/lib/supabase/server";

/**
 * POST /api/export
 * Triggers a payroll export to SharePoint for an approved timesheet or expense.
 * Only finance/admin roles can trigger this.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await isFinanceOrAdmin();
  if (!allowed) {
    return NextResponse.json({ error: "Finance or Admin role required" }, { status: 403 });
  }

  const { type, id } = await req.json();
  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }

  // Verify the item is approved
  const table = type === "timesheet" ? "timesheets" : "expense_reports";
  const { data: item }: any = await (supabase.from as any)(table).select("status").eq("id", id).single();
  if (!item || item.status !== "approved") {
    return NextResponse.json({ error: "Item must be approved before export" }, { status: 422 });
  }

  // Call the SharePoint export Netlify function.
  // Use request origin for same-host calls; fall back to NEXT_PUBLIC_APP_URL or URL env.
  const baseUrl =
    req.headers.get("x-forwarded-host")
      ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}`
      : process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/sharepoint-export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-workhub-secret": process.env.GRAPH_SYNC_SECRET!,
    },
    body: JSON.stringify({ type, id }),
  });

  const result = await response.json();
  return NextResponse.json(result, { status: response.ok ? 200 : 500 });
}
