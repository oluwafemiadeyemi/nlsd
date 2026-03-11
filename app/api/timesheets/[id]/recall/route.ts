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
    const { data: timesheet, error: loadError }: any = await supabase
      .from("timesheets")
      .select("id, employee_id, year, month, week_number, status")
      .eq("id", id)
      .single();

    if (loadError || !timesheet) {
      return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
    }
    if (timesheet.employee_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (timesheet.status !== "submitted") {
      return NextResponse.json({ error: "Only submitted timesheets can be recalled" }, { status: 400 });
    }

    const adminDb: any = createServiceClient();
    const recallPayload = {
      status: "draft",
      submitted_at: null,
      approved_at: null,
      rejected_at: null,
    };

    const { error: monthError } = await adminDb
      .from("timesheets")
      .update(recallPayload)
      .eq("id", timesheet.id);
    if (monthError) {
      return NextResponse.json({ error: monthError.message }, { status: 400 });
    }

    if (timesheet.week_number === 0) {
      const { error: weekError } = await adminDb
        .from("timesheets")
        .update(recallPayload)
        .eq("employee_id", user.id)
        .eq("year", timesheet.year)
        .eq("month", timesheet.month)
        .gt("week_number", 0);
      if (weekError) {
        return NextResponse.json({ error: weekError.message }, { status: 400 });
      }
    }

    await writeAudit({
      actorUserId: user.id,
      entityType: "timesheet",
      entityId: timesheet.id,
      action: "update",
      comment: "Recalled to draft",
      beforeJson: timesheet,
      afterJson: { ...timesheet, ...recallPayload },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 400 });
  }
}
