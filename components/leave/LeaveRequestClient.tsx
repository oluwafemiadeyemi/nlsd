"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LEAVE_TYPES } from "@/domain/leave/types";
import { calcBusinessDays, calcTotalLeaveHours } from "@/domain/leave/calculations";
import { validateLeaveRequest } from "@/domain/leave/validation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Save,
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  Upload,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ManagerCombobox, type ManagerOption } from "@/components/shared/ManagerCombobox";

interface LeaveFormData {
  leaveType: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  totalHours: number;
  employeeNotes: string;
  attachmentPath: string | null;
}

interface LeaveRequestClientProps {
  leaveId: string | null;
  userId: string;
  managerId: string | null;
  managers?: ManagerOption[];
  defaultManagerId?: string;
  status: string;
  userRole: string;
  managerComments?: string | null;
  initialData: LeaveFormData;
}

export function LeaveRequestClient({
  leaveId,
  userId,
  managerId,
  managers = [],
  defaultManagerId = "",
  status: initialStatus,
  userRole,
  managerComments,
  initialData,
}: LeaveRequestClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [selectedManager, setSelectedManager] = useState(managerId ?? defaultManagerId ?? "");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<LeaveFormData>(initialData);
  const [rejectionText, setRejectionText] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const isDraft = status === "draft";
  const isManagerRejected = status === "manager_rejected";
  const canEdit = isDraft || isManagerRejected;
  const canApprove =
    (status === "submitted" && (userRole === "manager" || userRole === "admin" || userRole === "finance")) ||
    (status === "manager_approved" && (userRole === "admin" || userRole === "finance"));

  // Auto-calculate total hours when dates or hours/day change
  const businessDays = form.startDate && form.endDate
    ? calcBusinessDays(form.startDate, form.endDate)
    : 0;
  const totalHours = calcTotalLeaveHours(businessDays, form.hoursPerDay);

  const validation = validateLeaveRequest({
    leaveType: form.leaveType,
    startDate: form.startDate,
    endDate: form.endDate,
    hoursPerDay: form.hoursPerDay,
    totalHours,
  });

  function updateField<K extends keyof LeaveFormData>(key: K, value: LeaveFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("leave-attachments")
        .upload(path, file);

      if (error) throw error;
      updateField("attachmentPath", path);
      toast({ title: "File uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function save(newStatus?: string) {
    setSaving(true);
    try {
      const payload = {
        leave_type: form.leaveType,
        start_date: form.startDate,
        end_date: form.endDate,
        hours_per_day: form.hoursPerDay,
        total_hours: totalHours,
        employee_notes: form.employeeNotes || null,
        attachment_path: form.attachmentPath,
        status: newStatus ?? status,
        ...(newStatus === "submitted" ? { submitted_at: new Date().toISOString() } : {}),
      };

      let id = leaveId;

      if (!id) {
        const { data, error } = await (supabase.from as any)("leave_requests")
          .insert({
            employee_id: userId,
            manager_id: selectedManager || managerId || null,
            ...payload,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await (supabase.from as any)("leave_requests")
          .update({ ...payload, manager_id: selectedManager || managerId || null })
          .eq("id", id);
        if (error) throw error;
      }

      // Audit log (best-effort; server routes handle approve/reject/recall auditing)
      await (supabase.from as any)("audit_log").insert({
        actor_user_id: userId,
        entity_type: "leave_request",
        entity_id: id,
        action: newStatus === "submitted" ? "submit" : leaveId ? "update" : "create",
      }).then(({ error }: any) => { if (error) console.warn("Audit write failed:", error.message); });

      if (newStatus) setStatus(newStatus);
      toast({
        title: newStatus === "submitted" ? "Leave request submitted" : "Saved",
        variant: "success",
      });

      if (!leaveId && id) {
        router.replace(`/leave/${id}`);
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
    try {
      const res = await fetch(`/api/leave/${leaveId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Approval failed");
      const newStatus = userRole === "manager" ? "manager_approved" : "approved";
      setStatus(newStatus);
      toast({ title: newStatus === "manager_approved" ? "Sent for final approval" : "Leave approved", variant: "success" });
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
    try {
      const res = await fetch(`/api/leave/${leaveId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerComments: rejectionText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rejection failed");
      const newStatus = userRole === "manager" ? "manager_rejected" : "rejected";
      setStatus(newStatus);
      setShowRejectModal(false);
      toast({ title: "Leave request rejected", variant: "destructive" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRecall() {
    if (!leaveId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leave/${leaveId}/recall`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Recall failed");

      setStatus("draft");
      toast({ title: "Leave request recalled to draft" });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-bold text-gray-900">
              {leaveId ? "Leave Request" : "New Leave Request"}
            </h2>
            <StatusBadge status={status} />
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <button
                  onClick={() => save()}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving…" : "Save Draft"}
                </button>
                <button
                  onClick={() => save("submitted")}
                  disabled={saving || !validation.valid || !selectedManager}
                  title={!selectedManager ? "Select a manager before submitting" : !validation.valid ? "Fix errors before submitting" : ""}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  Submit
                </button>
              </>
            )}

            {status === "submitted" && (
              <button
                onClick={handleRecall}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Recall
              </button>
            )}

            {canApprove && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        {/* Rejection banner */}
        {(status === "rejected" || status === "manager_rejected") && managerComments && (
          <div className={`mt-3 p-3 rounded-xl text-sm ${status === "manager_rejected" ? "bg-orange-50 border border-orange-200 text-orange-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            <strong>{status === "manager_rejected" ? "Manager rejected:" : "Rejected:"}</strong> {managerComments}
          </div>
        )}
      </div>

      {/* Form card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-5">
        {/* Validation errors */}
        {validation.errors.length > 0 && canEdit && (
          <div className="space-y-2">
            {validation.errors.map((e, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {e.message}
              </div>
            ))}
          </div>
        )}

        {/* Manager */}
        {canEdit && (
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
              Manager
            </label>
            <ManagerCombobox
              managers={managers}
              value={selectedManager}
              onChange={setSelectedManager}
              label=""
            />
          </div>
        )}

        {/* Leave Type */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Leave Type
          </label>
          {canEdit ? (
            <select
              value={form.leaveType}
              onChange={(e) => updateField("leaveType", e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">— Select type —</option>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-sm font-medium text-gray-900">{form.leaveType || "—"}</p>
          )}
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Start Date
            </label>
            {canEdit ? (
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-gray-900">{form.startDate || "—"}</p>
            )}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              End Date
            </label>
            {canEdit ? (
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => updateField("endDate", e.target.value)}
                min={form.startDate}
                className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-gray-900">{form.endDate || "—"}</p>
            )}
          </div>
        </div>

        {/* Hours per day + computed totals */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Hours / Day
            </label>
            {canEdit ? (
              <input
                type="number"
                value={form.hoursPerDay}
                onChange={(e) => updateField("hoursPerDay", parseFloat(e.target.value) || 0)}
                min={0}
                max={24}
                step={0.5}
                className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-gray-900">{form.hoursPerDay}</p>
            )}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Business Days
            </label>
            <p className="mt-1 text-sm font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl p-3">
              {businessDays}
            </p>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Total Hours
            </label>
            <p className="mt-1 text-sm font-bold text-primary bg-primary/5 border border-primary/20 rounded-xl p-3">
              {totalHours}h
            </p>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Notes
          </label>
          {canEdit ? (
            <textarea
              value={form.employeeNotes}
              onChange={(e) => updateField("employeeNotes", e.target.value)}
              placeholder="Any additional details…"
              className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-20 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          ) : (
            <p className="mt-1 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3 min-h-[3rem]">
              {form.employeeNotes || "No notes."}
            </p>
          )}
        </div>

        {/* Attachment */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Attachment
          </label>
          {canEdit ? (
            <div className="mt-1">
              {form.attachmentPath ? (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="truncate flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    {form.attachmentPath.split("/").pop()}
                  </span>
                  <button
                    onClick={() => updateField("attachmentPath", null)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl p-3 hover:border-primary/40 hover:text-primary transition-colors">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Uploading…" : "Upload file (PDF, JPEG, PNG)"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              {form.attachmentPath ? form.attachmentPath.split("/").pop() : "No attachment."}
            </p>
          )}
        </div>

        {/* Manager comments (read-only) */}
        {managerComments && (
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Manager Comments
            </label>
            <p className={cn(
              "mt-1 text-sm border rounded-xl p-3",
              status === "rejected" || status === "manager_rejected"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-gray-50 border-gray-200 text-gray-700"
            )}>
              {managerComments}
            </p>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg text-gray-900 mb-2">Reject Leave Request</h3>
            <p className="text-sm text-gray-500 mb-4">
              Please provide a reason for rejection.
            </p>
            <textarea
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              placeholder="Enter rejection reason…"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionText.trim() || saving}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 shadow-sm"
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
