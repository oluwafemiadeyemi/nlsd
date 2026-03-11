/**
 * POST /api/expenses/[id]/recall
 *
 * Recalls a submitted expense report back to draft status.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/server/audit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const { data: report, error: loadError }: any = await supabase
      .from("expense_reports")
      .select("id, employee_id, status")
      .eq("id", id)
      .single();

    if (loadError || !report) {
      return NextResponse.json({ error: "Expense report not found" }, { status: 404 });
    }
    if (report.employee_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (report.status !== "submitted") {
      return NextResponse.json({ error: "Only submitted reports can be recalled" }, { status: 400 });
    }

    const adminDb: any = createServiceClient();
    const { error: updateErr } = await adminDb
      .from("expense_reports")
      .update({
        status: "draft",
        submitted_at: null,
      })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    await writeAudit({
      actorUserId: user.id,
      entityType: "expense_report",
      entityId: id,
      action: "update",
      comment: "Recalled to draft",
      beforeJson: report,
      afterJson: { ...report, status: "draft", submitted_at: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 400 });
  }
}
