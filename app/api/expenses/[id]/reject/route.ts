/**
 * POST /api/expenses/[id]/reject
 * Authorization: Bearer <supabase_access_token>
 *
 * Rejects an expense report with a required reason.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBearerToken } from "@/lib/server/http";
import { supabaseAdmin, supabaseUser } from "@/lib/server/supabase";
import { writeAudit } from "@/lib/server/audit";
import { assertCanManagerAct } from "@/lib/server/workflow";

const BodySchema = z.object({
  managerComments: z.string().min(1, "Rejection reason is required").max(5000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const { id: reportId } = await params;
    if (!reportId) return NextResponse.json({ error: "Missing report id in path" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { managerComments } = BodySchema.parse(body);

    const userDb = supabaseUser(token);
    const { data: r, error: rErr } = await userDb
      .from("expense_reports")
      .select("id, employee_id, manager_id, status")
      .eq("id", reportId)
      .single();

    if (rErr || !r) return NextResponse.json({ error: "Expense report not found" }, { status: 404 });

    assertCanManagerAct(r.status as any);

    const adminDb = supabaseAdmin();
    const { data: updated, error: uErr } = await adminDb
      .from("expense_reports")
      .update({
        status: "rejected",
        manager_comments: managerComments,
        rejected_at: new Date().toISOString(),
        approved_at: null,
      })
      .eq("id", reportId)
      .select()
      .single();

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    await writeAudit({
      actorUserId: r.manager_id ?? null,
      entityType: "expense_report",
      entityId: reportId,
      action: "reject",
      comment: managerComments,
      beforeJson: r,
      afterJson: updated,
    });

    return NextResponse.json({ ok: true, report: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}
