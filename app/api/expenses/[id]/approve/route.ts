/**
 * POST /api/expenses/[id]/approve
 * Authorization: Bearer <supabase_access_token>
 *
 * Approves an expense report and triggers SharePoint sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBearerToken } from "@/lib/server/http";
import { supabaseAdmin, supabaseUser } from "@/lib/server/supabase";
import { writeAudit } from "@/lib/server/audit";
import { assertCanManagerAct } from "@/lib/server/workflow";
import { syncExpenseReportToSharePoint } from "@/lib/server/sharepoint/sync";

const BodySchema = z.object({
  managerComments: z.string().max(5000).optional(),
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
        status: "approved",
        manager_comments: managerComments ?? null,
        approved_at: new Date().toISOString(),
        rejected_at: null,
      })
      .eq("id", reportId)
      .select()
      .single();

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    await writeAudit({
      actorUserId: r.manager_id ?? null,
      entityType: "expense_report",
      entityId: reportId,
      action: "approve",
      comment: managerComments,
      beforeJson: r,
      afterJson: updated,
    });

    let sharepointSync: { ok: boolean; error?: string } = { ok: true };
    try {
      await syncExpenseReportToSharePoint(reportId);
      await writeAudit({
        actorUserId: r.manager_id ?? null,
        entityType: "sharepoint_sync",
        entityId: reportId,
        action: "sync_success",
        comment: "Expense SharePoint export succeeded",
      });
    } catch (syncErr: any) {
      sharepointSync = { ok: false, error: syncErr?.message };
      await writeAudit({
        actorUserId: r.manager_id ?? null,
        entityType: "sharepoint_sync",
        entityId: reportId,
        action: "sync_failed",
        comment: syncErr?.message ?? "SharePoint export failed",
      });
    }

    return NextResponse.json({ ok: true, report: updated, sharepointSync });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}
