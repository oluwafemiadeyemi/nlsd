/**
 * POST /api/timesheets/[id]/reject
 *
 * Rejects a timesheet with a required reason.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceClient, getCurrentUserRole } from "@/lib/supabase/server";
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
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const role = await getCurrentUserRole();
    if (!["manager", "admin", "finance"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { id: tsId } = await params;
    if (!tsId) return NextResponse.json({ error: "Missing timesheet id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { managerComments } = BodySchema.parse(body);

    const { data: ts, error: tsErr }: any = await supabase
      .from("timesheets")
      .select("id, employee_id, manager_id, status, year, month, week_number")
      .eq("id", tsId)
      .single();

    if (tsErr || !ts) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });

    assertCanManagerAct(ts.status);

    const newStatus = role === "manager" ? "manager_rejected" : "rejected";
    const weekStatus = role === "manager" ? "rejected" : "rejected";
    const adminDb: any = createServiceClient();
    const rejectedAt = new Date().toISOString();
    const { data: updated, error: uErr } = await adminDb
      .from("timesheets")
      .update({
        status: newStatus,
        manager_comments: managerComments,
        rejected_at: rejectedAt,
        approved_at: null,
      })
      .eq("id", tsId)
      .select()
      .single();

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    if (ts.week_number === 0) {
      const { error: weekErr } = await adminDb
        .from("timesheets")
        .update({
          status: weekStatus,
          rejected_at: rejectedAt,
          approved_at: null,
        })
        .eq("employee_id", ts.employee_id)
        .eq("year", ts.year)
        .eq("month", ts.month)
        .gt("week_number", 0);
      if (weekErr) {
        return NextResponse.json({ error: weekErr.message }, { status: 400 });
      }
    }

    await writeAudit({
      actorUserId: user.id,
      entityType: "timesheet",
      entityId: tsId,
      action: "reject",
      comment: managerComments,
      beforeJson: ts,
      afterJson: updated,
    });

    return NextResponse.json({ ok: true, timesheet: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}
