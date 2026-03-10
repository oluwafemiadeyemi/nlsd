/**
 * POST /api/expenses/[id]/submit
 * Authorization: Bearer <supabase_access_token>
 *
 * Submits an expense report for manager approval.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/server/http";
import { supabaseAdmin, supabaseUser } from "@/lib/server/supabase";
import { writeAudit } from "@/lib/server/audit";
import { assertCanSubmit } from "@/lib/server/workflow";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { id: reportId } = await params;
    if (!reportId) return NextResponse.json({ error: "Missing report id in path" }, { status: 400 });

    const userDb = supabaseUser(token);
    const { data: r, error: rErr } = await userDb
      .from("expense_reports")
      .select("id, employee_id, manager_id, status")
      .eq("id", reportId)
      .single();

    if (rErr || !r) return NextResponse.json({ error: "Expense report not found" }, { status: 404 });

    assertCanSubmit(r.status as any);

    const adminDb = supabaseAdmin();

    let managerId = r.manager_id as string | null;
    if (!managerId) {
      const { data: em } = await adminDb
        .from("employee_manager")
        .select("manager_id")
        .eq("employee_id", r.employee_id)
        .single();
      managerId = em?.manager_id ?? null;
    }

    const { data: updated, error: uErr } = await adminDb
      .from("expense_reports")
      .update({
        status: "submitted",
        manager_id: managerId,
        submitted_at: new Date().toISOString(),
        rejected_at: null,
        approved_at: null,
      })
      .eq("id", reportId)
      .select()
      .single();

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    await writeAudit({
      actorUserId: r.employee_id,
      entityType: "expense_report",
      entityId: reportId,
      action: "submit",
      beforeJson: r,
      afterJson: updated,
    });

    return NextResponse.json({ ok: true, report: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}
