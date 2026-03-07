"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Receipt,
  CalendarX2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ApprovalDetailClientProps {
  type: "timesheet" | "expense" | "leave";
  data: any;
  userId: string;
  userRole: "manager" | "finance" | "admin";
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ApprovalDetailClient({
  type,
  data,
  userId,
  userRole,
}: ApprovalDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState(data.status);
  const [processing, setProcessing] = useState(false);
  const [rejectionText, setRejectionText] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const canApprove =
    (status === "submitted" &&
      ["manager", "admin", "finance"].includes(userRole)) ||
    (status === "manager_approved" &&
      ["admin", "finance"].includes(userRole));
  const canReject = canApprove;

  const approveStatus =
    userRole === "manager" ? "manager_approved" : "approved";
  const rejectStatus =
    userRole === "manager" ? "manager_rejected" : "rejected";

  const table =
    type === "timesheet"
      ? "timesheets"
      : type === "leave"
      ? "leave_requests"
      : "expense_reports";
  const entityType =
    type === "timesheet"
      ? "timesheet"
      : type === "leave"
      ? "leave_request"
      : "expense_report";

  async function handleApprove() {
    setProcessing(true);
    try {
      await (supabase.from as any)(table)
        .update({
          status: approveStatus,
          approved_at: new Date().toISOString(),
        })
        .eq("id", data.id);

      await (supabase.from as any)("audit_log").insert({
        actor_user_id: userId,
        entity_type: entityType,
        entity_id: data.id,
        action: "approve",
      });

      setStatus(approveStatus);
      toast({
        title:
          userRole === "manager"
            ? "Sent for final approval"
            : `${type.charAt(0).toUpperCase() + type.slice(1)} approved`,
        variant: "success",
      });
      router.push("/approvals");
      router.refresh();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!rejectionText.trim()) return;
    setProcessing(true);
    try {
      await (supabase.from as any)(table)
        .update({
          status: rejectStatus,
          rejected_at: new Date().toISOString(),
          manager_comments: rejectionText,
        })
        .eq("id", data.id);

      await (supabase.from as any)("audit_log").insert({
        actor_user_id: userId,
        entity_type: entityType,
        entity_id: data.id,
        action: "reject",
        comment: rejectionText,
      });

      setStatus(rejectStatus);
      setShowRejectModal(false);
      toast({ title: "Rejected", variant: "destructive" });
      router.push("/approvals");
      router.refresh();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }

  const employee = data.employee;
  const TypeIcon =
    type === "timesheet" ? Clock : type === "leave" ? CalendarX2 : Receipt;
  const iconColor =
    type === "timesheet"
      ? "text-blue-500"
      : type === "leave"
      ? "text-amber-500"
      : "text-emerald-500";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/approvals")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Approvals
      </button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className={cn("w-5 h-5", iconColor)} />
            <span className="text-sm font-medium capitalize">
              {type} Submission
            </span>
            <StatusBadge status={status} />
          </div>
          <h2 className="text-xl font-semibold">
            {employee?.display_name ?? "Unknown"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {employee?.email}
            {employee?.department && ` · ${employee.department}`}
          </p>
          {data.submitted_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Submitted{" "}
              {format(
                new Date(data.submitted_at),
                "MMM d, yyyy 'at' h:mm a"
              )}
            </p>
          )}
        </div>

        {canApprove && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={processing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {processing ? "Processing..." : "Approve"}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={processing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Manager comments (if rejected previously) */}
      {data.manager_comments &&
        (status === "rejected" || status === "manager_rejected") && (
          <div
            className={cn(
              "p-3 rounded-lg border text-sm",
              status === "manager_rejected"
                ? "bg-orange-50 border-orange-200 text-orange-700"
                : "bg-red-50 border-red-200 text-red-700"
            )}
          >
            <strong>
              {status === "manager_rejected"
                ? "Manager rejected:"
                : "Rejected:"}
            </strong>{" "}
            {data.manager_comments}
          </div>
        )}

      {/* Employee notes */}
      {data.employee_notes && (
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-sm">
          <strong>Employee notes:</strong> {data.employee_notes}
        </div>
      )}

      {/* Type-specific detail */}
      {type === "timesheet" && <TimesheetDetail data={data} />}
      {type === "expense" && <ExpenseDetail data={data} />}
      {type === "leave" && <LeaveDetail data={data} />}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-xl border border-border shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-lg mb-2">
              Reject {type.charAt(0).toUpperCase() + type.slice(1)}
            </h3>
            <textarea
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full border border-border rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionText("");
                }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionText.trim() || processing}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {processing ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Timesheet Summary ─── */
function TimesheetDetail({ data }: { data: any }) {
  const rows = data.timesheet_rows ?? [];
  const monthNames = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const period =
    data.week_number <= 1
      ? `${monthNames[data.month]} ${data.year}`
      : `Week ${data.week_number}, ${monthNames[data.month]} ${data.year}`;

  // Calculate daily totals
  const dailyTotals = DAYS.map((day) =>
    rows.reduce((sum: number, row: any) => sum + (Number(row[day]) || 0), 0)
  );
  const grandTotal = rows.reduce(
    (sum: number, row: any) => sum + (Number(row.weekly_total) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Period:</span>
        <span className="font-medium">{period}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[160px]">
                Billing Type
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[140px]">
                Project
              </th>
              {DAY_LABELS.map((d) => (
                <th
                  key={d}
                  className="text-right px-2 py-2 text-xs font-medium text-muted-foreground min-w-[60px]"
                >
                  {d}
                </th>
              ))}
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground min-w-[70px] bg-muted/50">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="text-center py-6 text-sm text-muted-foreground"
                >
                  No timesheet entries
                </td>
              </tr>
            ) : (
              rows.map((row: any) => (
                <tr
                  key={row.id}
                  className="border-t border-border hover:bg-accent/20 transition-colors"
                >
                  <td className="px-3 py-2 text-sm font-medium">
                    {row.billing_type?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">
                    {row.project
                      ? `${row.project.code} ${row.project.title}`
                      : "—"}
                  </td>
                  {DAYS.map((day) => {
                    const val = Number(row[day]) || 0;
                    return (
                      <td
                        key={day}
                        className={cn(
                          "text-right px-2 py-2 text-sm",
                          val > 0 ? "font-medium" : "text-muted-foreground"
                        )}
                      >
                        {val > 0 ? val.toFixed(1) : "—"}
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-2 text-sm font-semibold bg-muted/30">
                    {(Number(row.weekly_total) || 0).toFixed(1)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50">
                <td
                  colSpan={2}
                  className="px-3 py-2 font-bold text-sm"
                >
                  Daily Total
                </td>
                {dailyTotals.map((total, i) => (
                  <td
                    key={i}
                    className={cn(
                      "text-right px-2 py-2 font-bold text-sm",
                      total > 0 ? "" : "text-muted-foreground"
                    )}
                  >
                    {total > 0 ? total.toFixed(1) : "—"}
                  </td>
                ))}
                <td className="text-right px-3 py-2 font-bold text-sm bg-primary/10 text-primary">
                  {grandTotal.toFixed(1)} hrs
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ─── Expense Summary ─── */
function ExpenseDetail({ data }: { data: any }) {
  const entries = (data.expense_entries ?? []).sort(
    (a: any, b: any) => a.day_index - b.day_index
  );

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Build totals
  let totalMileage = 0;
  let totalLodging = 0;
  let totalMeals = 0;
  let totalOther = 0;

  for (const e of entries) {
    totalMileage += Number(e.mileage_cost_claimed) || 0;
    totalLodging += Number(e.lodging_amount) || 0;
    totalMeals +=
      (Number(e.breakfast_amount) || 0) +
      (Number(e.lunch_amount) || 0) +
      (Number(e.dinner_amount) || 0);
    totalOther += Number(e.other_amount) || 0;
  }
  const grandTotal = totalMileage + totalLodging + totalMeals + totalOther;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div>
          <span className="text-muted-foreground">Period: </span>
          <span className="font-medium">
            Week {data.week_number}, {data.year}
          </span>
        </div>
        {data.destination && (
          <div>
            <span className="text-muted-foreground">Destination: </span>
            <span className="font-medium">{data.destination}</span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[120px]">
                Category
              </th>
              {entries.map((e: any) => (
                <th
                  key={e.day_index}
                  className="text-right px-2 py-2 text-xs font-medium text-muted-foreground min-w-[90px]"
                >
                  <div>{dayNames[e.day_index] ?? `Day ${e.day_index}`}</div>
                  {e.entry_date && (
                    <div className="font-normal text-xs">
                      {format(new Date(e.entry_date + "T00:00:00"), "MMM d")}
                    </div>
                  )}
                </th>
              ))}
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground min-w-[80px] bg-muted/50">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                label: "Mileage (km)",
                key: "mileage_km",
                format: (v: number) => (v > 0 ? `${v.toFixed(1)}km` : "—"),
                total: entries.reduce(
                  (s: number, e: any) =>
                    s + (Number(e.mileage_km) || 0),
                  0
                ),
                totalFmt: (v: number) => (v > 0 ? `${v.toFixed(1)}km` : "—"),
              },
              {
                label: "Mileage Cost",
                key: "mileage_cost_claimed",
                format: fmtCurrency,
                total: totalMileage,
                totalFmt: fmtCurrency,
              },
              {
                label: "Lodging",
                key: "lodging_amount",
                format: fmtCurrency,
                total: totalLodging,
                totalFmt: fmtCurrency,
              },
              {
                label: "Breakfast",
                key: "breakfast_amount",
                format: fmtCurrency,
                total: entries.reduce(
                  (s: number, e: any) =>
                    s + (Number(e.breakfast_amount) || 0),
                  0
                ),
                totalFmt: fmtCurrency,
              },
              {
                label: "Lunch",
                key: "lunch_amount",
                format: fmtCurrency,
                total: entries.reduce(
                  (s: number, e: any) =>
                    s + (Number(e.lunch_amount) || 0),
                  0
                ),
                totalFmt: fmtCurrency,
              },
              {
                label: "Dinner",
                key: "dinner_amount",
                format: fmtCurrency,
                total: entries.reduce(
                  (s: number, e: any) =>
                    s + (Number(e.dinner_amount) || 0),
                  0
                ),
                totalFmt: fmtCurrency,
              },
              {
                label: "Other",
                key: "other_amount",
                format: fmtCurrency,
                total: totalOther,
                totalFmt: fmtCurrency,
              },
            ].map((row) => (
              <tr
                key={row.key}
                className="border-t border-border hover:bg-accent/20 transition-colors"
              >
                <td className="px-3 py-1.5 text-sm font-medium">
                  {row.label}
                </td>
                {entries.map((e: any) => {
                  const val = Number(e[row.key]) || 0;
                  return (
                    <td key={e.day_index} className="text-right px-2 py-1.5 text-sm">
                      {row.format(val)}
                    </td>
                  );
                })}
                <td className="text-right px-3 py-1.5 text-sm font-semibold bg-muted/30">
                  {row.totalFmt(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50">
              <td className="px-3 py-2 font-bold text-sm">Daily Total</td>
              {entries.map((e: any) => {
                const dayTotal =
                  (Number(e.mileage_cost_claimed) || 0) +
                  (Number(e.lodging_amount) || 0) +
                  (Number(e.breakfast_amount) || 0) +
                  (Number(e.lunch_amount) || 0) +
                  (Number(e.dinner_amount) || 0) +
                  (Number(e.other_amount) || 0);
                return (
                  <td
                    key={e.day_index}
                    className="text-right px-2 py-2 font-bold text-sm"
                  >
                    {dayTotal > 0 ? fmtCurrency(dayTotal) : "—"}
                  </td>
                );
              })}
              <td className="text-right px-3 py-2 font-bold text-sm bg-primary/10 text-primary">
                {fmtCurrency(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Mileage", value: fmtCurrency(totalMileage) },
          { label: "Lodging", value: fmtCurrency(totalLodging) },
          { label: "Meals", value: fmtCurrency(totalMeals) },
          { label: "Other", value: fmtCurrency(totalOther) },
          { label: "Total", value: fmtCurrency(grandTotal), highlight: true },
        ].map((s) => (
          <div
            key={s.label}
            className={cn(
              "rounded-lg border border-border p-3",
              s.highlight && "bg-primary text-primary-foreground border-primary"
            )}
          >
            <p
              className={cn(
                "text-xs",
                s.highlight
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground"
              )}
            >
              {s.label}
            </p>
            <p className="font-bold text-sm mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Leave Summary ─── */
function LeaveDetail({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border overflow-hidden">
        <dl className="divide-y divide-border">
          <div className="grid grid-cols-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Leave Type</dt>
            <dd className="col-span-2 text-sm font-medium capitalize">
              {data.leave_type}
            </dd>
          </div>
          <div className="grid grid-cols-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Date Range</dt>
            <dd className="col-span-2 text-sm font-medium">
              {format(new Date(data.start_date + "T00:00:00"), "MMM d, yyyy")} &mdash;{" "}
              {format(new Date(data.end_date + "T00:00:00"), "MMM d, yyyy")}
            </dd>
          </div>
          <div className="grid grid-cols-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Hours per Day</dt>
            <dd className="col-span-2 text-sm font-medium">
              {Number(data.hours_per_day).toFixed(1)}
            </dd>
          </div>
          <div className="grid grid-cols-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Total Hours</dt>
            <dd className="col-span-2 text-sm font-bold">
              {Number(data.total_hours).toFixed(1)} hrs
            </dd>
          </div>
          {data.employee_notes && (
            <div className="grid grid-cols-3 px-4 py-3">
              <dt className="text-sm text-muted-foreground">Notes</dt>
              <dd className="col-span-2 text-sm">{data.employee_notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function fmtCurrency(v: number): string {
  if (v <= 0) return "—";
  return `$${v.toFixed(2)}`;
}
