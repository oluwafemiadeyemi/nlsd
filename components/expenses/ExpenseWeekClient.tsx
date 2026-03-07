"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseGrid } from "./ExpenseGrid";
import { AuditTimeline } from "@/components/ui/AuditTimeline";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { validateExpenseWeek } from "@/domain/expenses/validation";
import type { ExpenseDayEntry, ExpenseDay } from "@/domain/expenses/types";
import { EXPENSE_DAYS, DAY_INDEX } from "@/domain/expenses/types";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ReceiptUpload } from "./ReceiptUpload";
import { Save, Send, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";

interface ExpenseWeekClientProps {
  reportId: string | null;
  userId: string;
  weekNumber: string;
  year: number;
  weekBeginningDate: string;
  initialDays: Record<ExpenseDay, ExpenseDayEntry>;
  ratePerKm: number;
  weekDates: Partial<Record<ExpenseDay, string>>;
  status: string;
  userRole: string;
  userName: string;
  userEmail: string;
  managerId?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  managerComments?: string | null;
  employeeNotes?: string | null;
  destination?: string | null;
  auditLog: any[];
}

type Tab = "entry" | "history";

export function ExpenseWeekClient({
  reportId,
  userId,
  weekNumber,
  year,
  weekBeginningDate,
  initialDays,
  ratePerKm,
  weekDates,
  status: initialStatus,
  userRole,
  managerId,
  managerComments,
  employeeNotes,
  destination: initialDestination,
  auditLog,
}: ExpenseWeekClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [days, setDays] = useState<Record<ExpenseDay, ExpenseDayEntry>>(initialDays);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("entry");
  const [rejectionText, setRejectionText] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [notes, setNotes] = useState(employeeNotes ?? "");
  const [destination, setDestination] = useState(initialDestination ?? "");
  const [receiptPaths, setReceiptPaths] = useState<Record<number, string | null>>({});

  const isDraft = status === "draft";
  const isSubmitted = status === "submitted";
  const isManagerApproved = status === "manager_approved";
  const isManagerRejected = status === "manager_rejected";
  const isRejected = status === "rejected";
  const canEdit = isDraft || isManagerRejected || isRejected;
  const isApproved = status === "approved";
  const canApprove =
    (isSubmitted && (userRole === "manager" || userRole === "admin" || userRole === "finance")) ||
    (isManagerApproved && (userRole === "admin" || userRole === "finance"));
  const canReject =
    canApprove ||
    (isApproved && (userRole === "admin" || userRole === "finance")) ||
    (isManagerApproved && (userRole === "admin" || userRole === "finance"));

  const validation = validateExpenseWeek(days);

  async function writeAuditLog(id: string, action: string, comment?: string) {
    await (supabase.from as any)("audit_log").insert({
      actor_user_id: userId,
      entity_type: "expense_report",
      entity_id: id,
      action: action,
      comment: comment ?? null,
    });
  }

  async function save(newStatus?: string) {
    setSaving(true);
    try {
      let rId = reportId;

      // When creating a new report, always insert as draft first so RLS allows entry writes.
      // We'll update the status to the final value after entries are saved.
      if (!rId) {
        const { data, error } = await (supabase.from as any)("expense_reports")
          .insert({
            employee_id: userId,
            manager_id: managerId ?? null,
            year,
            week_number: weekNumber,
            week_beginning_date: weekBeginningDate,
            destination: destination || null,
            status: "draft",
            employee_notes: notes || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        rId = data.id;
      } else if (newStatus) {
        // For existing reports, update metadata but keep status as-is for now
        // so RLS still allows entry writes (status must be draft/rejected/manager_rejected)
        const { error } = await (supabase.from as any)("expense_reports")
          .update({
            destination: destination || null,
            employee_notes: notes || null,
          })
          .eq("id", rId);
        if (error) throw error;
      } else {
        // Plain save (no status change) — update everything
        const { error } = await (supabase.from as any)("expense_reports")
          .update({
            status: status,
            destination: destination || null,
            employee_notes: notes || null,
          })
          .eq("id", rId);
        if (error) throw error;
      }

      // Delete and re-insert entries while report is still in a writable status
      await (supabase.from as any)("expense_entries").delete().eq("report_id", rId);

      const weekStart = new Date(weekBeginningDate);
      const entryRows = EXPENSE_DAYS.map((day) => {
        const entry = days[day];
        const idx = DAY_INDEX[day];
        return {
          report_id: rId!,
          day_index: idx,
          entry_date: format(addDays(weekStart, idx), "yyyy-MM-dd"),
          travel_from: entry.travelFrom ?? null,
          travel_to: entry.travelTo ?? null,
          mileage_km: entry.mileageKm,
          mileage_cost_claimed: entry.mileageCostClaimed,
          lodging_amount: entry.lodging,
          breakfast_amount: entry.breakfast,
          lunch_amount: entry.lunch,
          dinner_amount: entry.dinner,
          other_amount: entry.other,
          other_note: entry.otherNote ?? null,
          notes: entry.notes || null,
        };
      });

      const { error: entryError } = await (supabase.from as any)("expense_entries").insert(entryRows);
      if (entryError) throw entryError;

      // NOW update the status (after entries are saved)
      if (newStatus) {
        const { error: statusError } = await (supabase.from as any)("expense_reports")
          .update({
            status: newStatus,
            ...(newStatus === "submitted" ? { submitted_at: new Date().toISOString() } : {}),
          })
          .eq("id", rId);
        if (statusError) throw statusError;
      }

      await writeAuditLog(
        rId!,
        newStatus === "submitted" ? "submit" : reportId ? "update" : "create"
      );

      if (newStatus) setStatus(newStatus);
      toast({ title: newStatus === "submitted" ? "Submitted for approval" : "Saved", variant: "success" });

      if (!reportId && rId) {
        router.replace(`/expenses/${rId}`);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    // Manager → manager_approved; Finance/Admin → approved (final)
    const newStatus = userRole === "manager" ? "manager_approved" : "approved";
    try {
      await (supabase.from as any)("expense_reports")
        .update({ status: newStatus, approved_at: new Date().toISOString() })
        .eq("id", reportId!);
      await writeAuditLog(reportId!, "approve");
      setStatus(newStatus);
      toast({ title: userRole === "manager" ? "Sent for final approval" : "Expense claim approved", variant: "success" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectionText.trim()) return;
    setSaving(true);
    // Manager → manager_rejected; Finance/Admin → rejected (final)
    const newStatus = userRole === "manager" ? "manager_rejected" : "rejected";
    try {
      await (supabase.from as any)("expense_reports")
        .update({ status: newStatus, rejected_at: new Date().toISOString(), manager_comments: rejectionText })
        .eq("id", reportId!);
      await writeAuditLog(reportId!, "reject", rejectionText);
      setStatus(newStatus);
      setShowRejectModal(false);
      toast({ title: "Expense claim rejected", variant: "destructive" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRecall() {
    if (!reportId) return;
    setSaving(true);
    try {
      await (supabase.from as any)("expense_reports").update({ status: "draft", submitted_at: null }).eq("id", reportId);
      await writeAuditLog(reportId, "update", "Recalled to draft");
      setStatus("draft");
      toast({ title: "Recalled to draft" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Week {weekNumber}, {year}</h2>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => save()}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => save("submitted")}
                disabled={saving || !validation.valid}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Submit for Approval
              </button>
            </>
          )}

          {isSubmitted && (
            <button
              onClick={handleRecall}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-accent"
            >
              <RotateCcw className="w-4 h-4" />
              Recall
            </button>
          )}

          {canApprove && (
              <button onClick={handleApprove} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
          )}
          {canReject && (
              <button onClick={() => setShowRejectModal(true)} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                <XCircle className="w-4 h-4" />
                Reject
              </button>
          )}
        </div>
      </div>

      {(status === "rejected" || status === "manager_rejected") && managerComments && (
        <div className={`p-3 rounded-lg border text-sm ${status === "manager_rejected" ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          <strong>{status === "manager_rejected" ? "Manager rejected:" : "Rejected:"}</strong> {managerComments}
        </div>
      )}

      {/* Destination + notes fields */}
      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Destination</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Calgary — Client site"
              className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for your manager…"
              className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["entry", "history"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "entry" ? "Expense Entry" : "History"}
          </button>
        ))}
      </div>

      {activeTab === "entry" && (
        <>
          <ExpenseGrid
            days={days}
            ratePerKm={ratePerKm}
            weekDates={weekDates}
            readOnly={!canEdit}
            onChange={setDays}
          />
          {reportId && (
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Receipts</p>
              <div className="grid grid-cols-6 gap-2">
                {EXPENSE_DAYS.map((day) => {
                  const idx = DAY_INDEX[day];
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                      <ReceiptUpload
                        userId={userId}
                        reportId={reportId}
                        dayIndex={idx}
                        existingPath={receiptPaths[idx]}
                        onUploaded={(path) => setReceiptPaths((prev) => ({ ...prev, [idx]: path }))}
                        readOnly={!canEdit}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "history" && (
        <div className="max-w-sm">
          <AuditTimeline entries={auditLog} />
        </div>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-xl border border-border shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-lg mb-2">Reject Expense Claim</h3>
            <textarea
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              placeholder="Enter rejection reason…"
              className="w-full border border-border rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent">Cancel</button>
              <button
                onClick={handleReject}
                disabled={!rejectionText.trim() || saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
