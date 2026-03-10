import { supabaseAdmin } from "./supabase";

type AuditEntity = "timesheet" | "expense_report" | "sharepoint_sync" | "directory_sync" | "app_config";
type AuditAction =
  | "create"
  | "update"
  | "submit"
  | "approve"
  | "reject"
  | "sync_success"
  | "sync_failed";

export async function writeAudit(args: {
  actorUserId: string | null;
  entityType: AuditEntity;
  entityId: string | null;
  action: AuditAction;
  comment?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("audit_log").insert({
    actor_user_id: args.actorUserId,
    entity_type: args.entityType as any,
    entity_id: args.entityId,
    action: args.action as any,
    comment: args.comment ?? null,
    before_json: args.beforeJson ?? null,
    after_json: args.afterJson ?? null,
  });
  if (error) console.error("[audit] Failed to write audit log:", error.message);
}
