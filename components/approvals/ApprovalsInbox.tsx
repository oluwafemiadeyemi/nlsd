"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, XCircle, Clock, Receipt, CalendarX2,
  ExternalLink, Sparkles, CheckCheck, X, Building2, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Drawer } from "@/components/ui/Drawer";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type FilterTab = "all" | "timesheet" | "expense" | "leave";

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  timesheet: {
    icon: Clock,
    color: "text-blue-500",
    bgColor: "bg-blue-500",
    lightBg: "bg-blue-50",
    borderColor: "border-l-blue-500",
    label: "Timesheet",
    pluralLabel: "Timesheets",
  },
  expense: {
    icon: Receipt,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500",
    lightBg: "bg-emerald-50",
    borderColor: "border-l-emerald-500",
    label: "Expense",
    pluralLabel: "Expenses",
  },
  leave: {
    icon: CalendarX2,
    color: "text-amber-500",
    bgColor: "bg-amber-500",
    lightBg: "bg-amber-50",
    borderColor: "border-l-amber-500",
    label: "Leave",
    pluralLabel: "Leave",
  },
} as const;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "timesheet", label: "Timesheets" },
  { key: "expense", label: "Expenses" },
  { key: "leave", label: "Leave" },
];

const AVATAR_COLORS = [
  "bg-blue-600", "bg-emerald-600", "bg-amber-600",
  "bg-violet-600", "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-teal-600",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" };
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return (
    <div className={cn("rounded-full flex items-center justify-center text-white font-semibold shrink-0", sizeClasses[size], AVATAR_COLORS[idx])}>
      {initials || "?"}
    </div>
  );
}

function getOldestAge(items: ApprovalItem[]): { label: string; severity: "normal" | "warning" | "urgent" } {
  if (items.length === 0) return { label: "None", severity: "normal" };
  const oldest = items.reduce((a, b) =>
    new Date(a.submittedAt).getTime() < new Date(b.submittedAt).getTime() ? a : b
  );
  const daysAgo = Math.floor((Date.now() - new Date(oldest.submittedAt).getTime()) / 86400000);
  const label = formatDistanceToNow(new Date(oldest.submittedAt), { addSuffix: true });
  return { label, severity: daysAgo >= 7 ? "urgent" : daysAgo >= 3 ? "warning" : "normal" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ApprovalsInbox({ items: initialItems, managerId, userRole }: ApprovalsInboxProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerItem, setDrawerItem] = useState<ApprovalItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rejectionText, setRejectionText] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [bulkRejectTarget, setBulkRejectTarget] = useState<string[]>([]);

  const filteredItems = activeTab === "all" ? items : items.filter((i) => i.type === activeTab);
  const filteredSet = new Set(filteredItems.map((i) => i.id));
  const selectedIds = Array.from(selected).filter((id) => filteredSet.has(id));

  const stats = useMemo(() => {
    const counts = { all: items.length, timesheet: 0, expense: 0, leave: 0 };
    items.forEach((i) => { counts[i.type]++; });
    return counts;
  }, [items]);

  const oldestAge = useMemo(() => getOldestAge(items), [items]);

  const approveLabel = userRole === "manager" ? "Manager approved" : "Approved";

  // ─── Actions ─────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const filteredIds = new Set(filteredItems.map((i) => i.id));
    const allFilteredSelected = filteredItems.every((i) => selected.has(i.id));
    if (allFilteredSelected) {
      setSelected((prev) => { const next = new Set(prev); filteredIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => new Set([...prev, ...filteredIds]));
    }
  }

  function apiBase(item: ApprovalItem) {
    if (item.type === "timesheet") return `/api/timesheets/${item.id}`;
    if (item.type === "leave") return `/api/leave/${item.id}`;
    return `/api/expenses/${item.id}`;
  }

  async function approveItems(ids: string[]) {
    setProcessing(true);
    let successCount = 0;
    try {
      for (const id of ids) {
        const item = items.find((i) => i.id === id);
        if (!item) continue;
        const res = await fetch(`${apiBase(item)}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Approval failed");
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
        const res = await fetch(`${apiBase(item)}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managerComments: reason }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Rejection failed");
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
    if (drawerItem && ids.includes(drawerItem.id)) setDrawerItem(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#f8f9fb" }}>

      {/* ═══ A. Stats Summary Bar ═══ */}
      <div className="px-6 pt-6 pb-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-xl border border-border bg-background p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-muted-foreground mb-1">Total Pending</p>
            <p className="text-3xl font-bold text-foreground">{stats.all}</p>
            {items.length > 0 && (
              <p className={cn(
                "text-[11px] mt-1.5 font-medium",
                oldestAge.severity === "urgent" ? "text-red-500" :
                oldestAge.severity === "warning" ? "text-amber-500" : "text-muted-foreground"
              )}>
                Oldest: {oldestAge.label}
              </p>
            )}
          </motion.div>

          {/* Per-type cards */}
          {(["timesheet", "expense", "leave"] as const).map((type, i) => {
            const cfg = TYPE_CONFIG[type];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: (i + 1) * 0.08 }}
                className={cn(
                  "rounded-xl border border-border bg-background p-4 shadow-sm border-l-4 cursor-pointer transition-colors hover:bg-accent/30",
                  cfg.borderColor,
                )}
                onClick={() => setActiveTab(type)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("w-4 h-4", cfg.color)} />
                  <p className="text-xs font-medium text-muted-foreground">{cfg.pluralLabel}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{stats[type]}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ═══ B. Tab Filter + Select All ═══ */}
      <div className="px-6 pt-4 pb-2 flex items-center gap-4 flex-wrap">
        <div className="relative flex items-center gap-0.5 p-1 rounded-lg bg-muted/60">
          {FILTER_TABS.map((tab) => {
            const count = tab.key === "all" ? items.length : items.filter((i) => i.type === tab.key).length;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelected(new Set()); }}
                className={cn(
                  "relative px-4 py-1.5 text-sm font-medium rounded-md transition-colors z-10",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-primary rounded-md shadow-sm"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{tab.label} ({count})</span>
              </button>
            );
          })}
        </div>

        {filteredItems.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filteredItems.length > 0 && filteredItems.every((i) => selected.has(i.id))}
              onChange={toggleAll}
              className="rounded"
            />
            Select all
          </label>
        )}
      </div>

      {/* ═══ C. Card Grid / F. Empty State ═══ */}
      <div className="flex-1 px-6 pb-24">
        {filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6"
            >
              <Sparkles className="w-10 h-10 text-emerald-500" />
            </motion.div>
            <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              No pending approvals. All submissions have been reviewed.
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item, index) => {
                const cfg = TYPE_CONFIG[item.type];
                const Icon = cfg.icon;
                const isSelected = selected.has(item.id);
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                    className={cn(
                      "rounded-xl border bg-background shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 relative group",
                      cfg.borderColor,
                      isSelected && "ring-2 ring-primary bg-primary/5"
                    )}
                    onClick={() => setDrawerItem(item)}
                  >
                    {/* Card header */}
                    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="absolute -left-0.5 -top-0.5 w-5 h-5 rounded opacity-0 group-hover:opacity-100 checked:opacity-100 cursor-pointer z-10 transition-opacity"
                        />
                        <Avatar name={item.user.display_name} size="md" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.user.display_name}</p>
                        {item.user.department && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground truncate">{item.user.department}</p>
                          </div>
                        )}
                      </div>
                      <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium", cfg.lightBg, cfg.color)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="px-4 pb-2">
                      <div className="flex items-baseline justify-between mb-1">
                        <p className="text-sm font-medium text-foreground">{item.period}</p>
                        <p className="text-lg font-bold text-foreground">{item.amountLabel}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={item.status} />
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(item.submittedAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>

                    {/* Card footer — quick actions */}
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => approveItems([item.id])}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => { setBulkRejectTarget([item.id]); setShowRejectModal(true); }}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ═══ D. Detail Drawer ═══ */}
      <Drawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem ? `${TYPE_CONFIG[drawerItem.type].label} Review` : ""}
        width="lg"
        footer={
          drawerItem ? (
            <div className="flex gap-3">
              <button
                onClick={() => approveItems([drawerItem.id])}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
              <button
                onClick={() => { setBulkRejectTarget([drawerItem.id]); setShowRejectModal(true); }}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          ) : undefined
        }
      >
        {drawerItem && (
          <div className="space-y-6">
            {/* Employee info */}
            <div className="flex items-center gap-4">
              <Avatar name={drawerItem.user.display_name} size="lg" />
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{drawerItem.user.display_name}</h3>
                <p className="text-sm text-muted-foreground truncate">{drawerItem.user.email}</p>
                {drawerItem.user.department && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{drawerItem.user.department}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
                <StatusBadge status={drawerItem.status} />
              </div>
              <div className="h-px bg-border" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Period</p>
                  <p className="text-sm font-medium">{drawerItem.period}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    {drawerItem.type === "timesheet" ? "Total Hours" : "Total Amount"}
                  </p>
                  <p className="text-sm font-bold">{drawerItem.amountLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Submitted</p>
                  <p className="text-sm">{format(new Date(drawerItem.submittedAt), "MMM d, yyyy")}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(drawerItem.submittedAt), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Department</p>
                  <p className="text-sm">{drawerItem.user.department ?? "—"}</p>
                </div>
              </div>
            </div>

            {/* Full details link */}
            <a
              href={drawerItem.href}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-accent transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View full {TYPE_CONFIG[drawerItem.type].label.toLowerCase()} details
            </a>
          </div>
        )}
      </Drawer>

      {/* ═══ E. Floating Bulk Action Bar ═══ */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 bg-background border border-border rounded-2xl shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <CheckCheck className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <button
              onClick={() => approveItems(selectedIds)}
              disabled={processing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Approve All
            </button>
            <button
              onClick={() => { setBulkRejectTarget(selectedIds); setShowRejectModal(true); }}
              disabled={processing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject All
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Reject Modal ═══ */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md p-6"
            >
              <h3 className="font-semibold text-lg mb-2">
                Reject {bulkRejectTarget.length} Item{bulkRejectTarget.length !== 1 ? "s" : ""}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                The employee(s) will be notified with this reason.
              </p>
              <textarea
                value={rejectionText}
                onChange={(e) => setRejectionText(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full border border-border rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectionText(""); }}
                  className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => rejectItems(bulkRejectTarget, rejectionText)}
                  disabled={!rejectionText.trim() || processing}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {processing ? "Rejecting..." : "Reject"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
