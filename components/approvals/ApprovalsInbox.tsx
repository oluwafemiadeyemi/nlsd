"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Clock, Receipt, CalendarX2, ExternalLink, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ApprovalItem {
  id: string;
  type: "timesheet" | "expense" | "leave";
  period: string;
  status: string;
  amountLabel: string;
  submittedAt: string;
  user: { id: string; display_name: string; email: string; department?: string };
  href: string;
}

interface ApprovalsInboxProps {
  items: ApprovalItem[];
  managerId: string;
  userRole: "manager" | "finance" | "admin";
}

export function ApprovalsInbox({ items: initialItems, managerId, userRole }: ApprovalsInboxProps) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<ApprovalItem | null>(items[0] ?? null);
  const [processing, setProcessing] = useState(false);
  const [rejectionText, setRejectionText] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [bulkRejectTarget, setBulkRejectTarget] = useState<string[]>([]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  async function writeAuditLog(id: string, entityType: "timesheet" | "expense_report" | "leave_request", action: string, comment?: string) {
    await (supabase.from as any)("audit_log").insert({
      actor_user_id: managerId,
      entity_type: entityType,
      entity_id: id,
      action: action,
      comment: comment ?? null,
    });
  }

  // Manager → manager_approved; Finance/Admin → approved (final)
  const approveStatus = userRole === "manager" ? "manager_approved" : "approved";
  // Manager → manager_rejected; Finance/Admin → rejected (final)
  const rejectStatus = userRole === "manager" ? "manager_rejected" : "rejected";
  const approveLabel = userRole === "manager" ? "Manager approved" : "Approved";

  async function approveItems(ids: string[]) {
    setProcessing(true);
    let successCount = 0;
    try {
      for (const id of ids) {
        const item = items.find((i) => i.id === id);
        if (!item) continue;

        const table = item.type === "timesheet" ? "timesheets" : item.type === "leave" ? "leave_requests" : "expense_reports";
        const entityType = item.type === "timesheet" ? "timesheet" : item.type === "leave" ? "leave_request" : "expense_report";

        await (supabase.from as any)(table)
          .update({ status: approveStatus, approved_at: new Date().toISOString() })
          .eq("id", id);

        await writeAuditLog(id, entityType as any, "approve");
        successCount++;
      }

      removeFromList(ids);
      toast({ title: `${successCount} item${successCount !== 1 ? "s" : ""} ${approveLabel.toLowerCase()}`, variant: "success" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  async function rejectItems(ids: string[], reason: string) {
    setProcessing(true);
    try {
      for (const id of ids) {
        const item = items.find((i) => i.id === id);
        if (!item) continue;
        const table = item.type === "timesheet" ? "timesheets" : item.type === "leave" ? "leave_requests" : "expense_reports";
        const entityType = item.type === "timesheet" ? "timesheet" : item.type === "leave" ? "leave_request" : "expense_report";

        await (supabase.from as any)(table)
          .update({ status: rejectStatus, rejected_at: new Date().toISOString(), manager_comments: reason })
          .eq("id", id);

        await writeAuditLog(id, entityType as any, "reject", reason);
      }

      removeFromList(ids);
      setShowRejectModal(false);
      setRejectionText("");
      toast({ title: `${ids.length} item${ids.length !== 1 ? "s" : ""} rejected`, variant: "destructive" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  function removeFromList(ids: string[]) {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelected(new Set());
    if (activeItem && ids.includes(activeItem.id)) {
      const remaining = items.filter((i) => !ids.includes(i.id));
      setActiveItem(remaining[0] ?? null);
    }
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Left: item list */}
      <div className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col max-h-[40vh] md:max-h-none">
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-border">
            <span className="text-xs font-medium text-primary flex-1">{selected.size} selected</span>
            <button
              onClick={() => approveItems(selectedIds)}
              disabled={processing}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle className="w-3 h-3" />
              Approve all
            </button>
            <button
              onClick={() => { setBulkRejectTarget(selectedIds); setShowRejectModal(true); }}
              disabled={processing}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" />
              Reject all
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <input
            type="checkbox"
            checked={selected.size === items.length && items.length > 0}
            onChange={toggleAll}
            className="rounded"
          />
          <span className="text-xs font-medium text-muted-foreground">{items.length} pending</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center px-4">
              <CheckCircle className="w-10 h-10 text-emerald-500 mb-3" />
              <p className="font-medium text-sm">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">No pending approvals</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={() => setActiveItem(item)}
                className={cn(
                  "flex items-start gap-2 px-3 py-3 border-b border-border cursor-pointer transition-colors group",
                  activeItem?.id === item.id ? "bg-primary/10" : "hover:bg-accent/50"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {item.type === "timesheet" ? (
                      <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : item.type === "leave" ? (
                      <CalendarX2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <Receipt className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    <span className="text-xs font-medium text-muted-foreground capitalize">{item.type}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{item.user.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.period} · {item.amountLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(item.submittedAt), "MMM d")}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-1" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeItem ? (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {activeItem.type === "timesheet" ? (
                    <Clock className="w-4 h-4 text-blue-500" />
                  ) : activeItem.type === "leave" ? (
                    <CalendarX2 className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Receipt className="w-4 h-4 text-emerald-500" />
                  )}
                  <span className="text-sm font-medium capitalize">{activeItem.type} Submission</span>
                  <StatusBadge status={activeItem.status} />
                </div>
                <h2 className="text-lg font-semibold">{activeItem.user.display_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {activeItem.user.email}
                  {activeItem.user.department && ` · ${activeItem.user.department}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={activeItem.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open
                </a>
                <button
                  onClick={() => approveItems([activeItem.id])}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => { setBulkRejectTarget([activeItem.id]); setShowRejectModal(true); }}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Period</dt>
                  <dd className="font-medium text-sm">{activeItem.period}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {activeItem.type === "timesheet" ? "Total Hours" : "Total Amount"}
                  </dt>
                  <dd className="font-bold text-sm">{activeItem.amountLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Submitted</dt>
                  <dd className="text-sm">{format(new Date(activeItem.submittedAt), "MMM d, yyyy 'at' h:mm a")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Department</dt>
                  <dd className="text-sm">{activeItem.user.department ?? "—"}</dd>
                </div>
              </dl>
              <div className="mt-6">
                <a href={activeItem.href} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  View full {activeItem.type} details
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">Select an item to review</p>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-xl border border-border shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-lg mb-2">
              Reject {bulkRejectTarget.length} Item{bulkRejectTarget.length !== 1 ? "s" : ""}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">The employee(s) will be notified with this reason.</p>
            <textarea
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              placeholder="Enter rejection reason…"
              className="w-full border border-border rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectionText(""); }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectItems(bulkRejectTarget, rejectionText)}
                disabled={!rejectionText.trim() || processing}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {processing ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
