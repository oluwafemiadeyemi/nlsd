import { createServerSupabaseClient, getCurrentUserRole, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { format, getISOWeek } from "date-fns";
import type { Metadata } from "next";
import { ProfileImageUpload } from "@/components/dashboard/ProfileImageUpload";
import { MyRequestsCard } from "@/components/dashboard/MyRequestsCard";
import { OverviewTabsCard } from "@/components/dashboard/OverviewTabsCard";
import { HoursChart } from "@/components/dashboard/HoursChart";

export const metadata: Metadata = { title: "Dashboard" };

// ─── Set NEXT_PUBLIC_DEMO_MODE=true in .env.local to see the exact reference design ───
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ─── Sample data matching the reference image exactly ─────────────────────────
const DEMO = {
  name: "Temmy",
  fullName: "Temmy Jegede",
  email: "temmy.jegede@company.com",
  avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg",
  jobTitle: "UI/UX Designer",
  department: "Design",
  contractedHours: 40,
  monthlyHours: 38,
  weeklyHours: 8.4,
  todayHours: 6.667,
  monthlyExpenses: 200,
  expenseBreakdown: [
    { label: "Mileage Cost", amount: 90, bg: "bg-amber-100", fg: "text-amber-700" },
    { label: "Meals",   amount: 40, bg: "bg-pink-100",  fg: "text-pink-600"  },
    { label: "Lodge",   amount: 70, bg: "bg-sky-100",   fg: "text-sky-600"   },
  ],
  project: {
    name: "Omondo.Com",
    status: "In Progress",
    manager: "Henry Jay.",
    designLead: "Fathom Y.",
    teamCount: 12,
    timeline: "05/09/2025",
    description: "Mobile And Desktop App Design For The...",
  },
  week: [
    { day: "Mon", date: 22, active: false },
    { day: "Tue", date: 23, active: false },
    { day: "Wed", date: 24, active: true },
    { day: "Thu", date: 25, active: false },
    { day: "Fri", date: 26, active: false },
    { day: "Sat", date: 27, active: false },
  ],
  events: [
    {
      title: "Work Location",
      subtitle: "Vancouver, Canada",
      bg: "bg-primary/10",
      border: "border-primary/20",
      titleFg: "text-primary",
      subFg: "text-primary/60",
      dots: ["bg-orange-400", "bg-primary/60", "bg-emerald-400"],
      style: { top: "8%", left: "17%", right: "38%", height: "37%" },
    },
    {
      title: "Onboarding Session",
      subtitle: "Introduction for new hires",
      bg: "bg-violet-50",
      border: "border-violet-100",
      titleFg: "text-violet-800",
      subFg: "text-violet-400",
      dots: ["bg-pink-400", "bg-violet-400"],
      style: { top: "57%", left: "50%", right: "2%", height: "35%" },
    },
  ],
  requests: [
    { id: "r1", kind: "expense",    label: "Expense",      sub: "Sep 01, 07:00", dot: "check-yellow" },
    { id: "r2", kind: "timesheet",  label: "Time Sheet",   sub: "Sep 01, 08:00", dot: "check-yellow" },
    { id: "r3", kind: "leave",      label: "Annual Leave", sub: "Sep 01, 09:00", dot: "pending-gray" },
    { id: "r4", kind: "leave",      label: "Sick Leave",   sub: "Sep 01, 10:00", dot: "pending-gray" },
    { id: "r5", kind: "leave",      label: "Holiday",      sub: "",               dot: "pending-gray" },
  ],
  progressTodayIndex: 4, // Thursday = index 4 in S M T W T F S
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function currentPeriod() {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, week: Math.min(Math.ceil(n.getDate() / 7), 5) };
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { year, month, week } = currentPeriod();

  const role = await getCurrentUserRole();
  const isApprover = role === "manager" || role === "admin" || role === "finance";
  const isoWeek = String(getISOWeek(new Date())).padStart(2, "0");
  // Always fetch — used in live mode or as fallback
  const [tsRes, exRes, profRes, wkExRes, pendingExRes, pendingTsRes, monthlyTsRes, pendingLeaveRes]: any[] = await Promise.all([
    supabase.from("timesheets")
      .select("id,year,month,week_number,status,employee_notes,manager_comments,created_at")
      .eq("employee_id", user.id)
      .order("year",{ascending:false}).order("month",{ascending:false}).order("week_number",{ascending:false})
      .limit(6),
    supabase.from("expense_reports")
      .select("id,year,week_number,status,created_at")
      .eq("employee_id", user.id)
      .order("year",{ascending:false}).order("week_number",{ascending:false})
      .limit(6),
    supabase.from("profiles")
      .select("display_name,email,avatar_url,department,job_title")
      .eq("id", user.id).single(),
    supabase.from("expense_reports")
      .select("expense_entries(mileage_cost,lodging_amount,breakfast_amount,lunch_amount,dinner_amount,other_amount)")
      .eq("employee_id",user.id).eq("year",year).eq("week_number",isoWeek),
    isApprover
      ? supabase.from("expense_reports")
          .select("id, year, week_number, submitted_at, employee:profiles!employee_id(display_name)")
          .eq("status", "submitted")
          .order("submitted_at")
          .limit(5)
      : Promise.resolve({ data: [] }),
    isApprover
      ? supabase.from("timesheets")
          .select("id, year, month, week_number, submitted_at, employee:profiles!employee_id(display_name)")
          .eq("status", "submitted")
          .order("submitted_at")
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase.from("timesheets")
      .select("month, timesheet_rows(weekly_total)")
      .eq("employee_id", user.id)
      .eq("year", year)
      .neq("status", "draft"),
    isApprover
      ? supabase.from("leave_requests")
          .select("id, leave_type, start_date, end_date, total_hours, submitted_at, employee:profiles!employee_id(display_name)")
          .eq("status", "submitted")
          .order("submitted_at")
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  // ── Data source selection ──────────────────────────────────────────────────
  const realProfile      = profRes.data;
  const realTimesheets   = tsRes.data ?? [];
  const realExpenses     = exRes.data ?? [];

  const expEntries = (wkExRes.data ?? []).flatMap((e:any) => e.expense_entries ?? []);
  const catMileage = expEntries.reduce((s:number, e:any) => s + (e.mileage_cost ?? 0), 0);
  const catLodging = expEntries.reduce((s:number, e:any) => s + (e.lodging_amount ?? 0), 0);
  const catMeals   = expEntries.reduce((s:number, e:any) => s + (e.breakfast_amount ?? 0) + (e.lunch_amount ?? 0) + (e.dinner_amount ?? 0), 0);
  const catOther   = expEntries.reduce((s:number, e:any) => s + (e.other_amount ?? 0), 0);
  const weeklyExpenseTotal = catMileage + catLodging + catMeals + catOther;

  const displayName   = isDemoMode ? DEMO.fullName  : (realProfile?.display_name ?? user.email ?? "");
  const firstName     = isDemoMode ? DEMO.name      : (displayName.split(" ")[0] ?? "there");
  const displayEmail  = isDemoMode ? DEMO.email     : (realProfile?.email ?? user.email ?? "");
  // Real uploaded avatar always wins; fall back to demo placeholder only when none exists
  const avatarUrl     = realProfile?.avatar_url ?? (isDemoMode ? DEMO.avatarUrl : undefined);
  const jobTitle      = isDemoMode ? DEMO.jobTitle  : (realProfile?.job_title ?? "Team Member");
  const department    = isDemoMode ? DEMO.department: (realProfile?.department ?? "");
  const initials      = displayName.charAt(0).toUpperCase() || "U";

  const weeklyExpenses = isDemoMode ? DEMO.monthlyExpenses : weeklyExpenseTotal;

  const newExHref = `/expenses/new?year=${year}&week=${String(week).padStart(2,"0")}`;

  // Expense breakdown — live categories, filtered to non-zero
  const liveExpBreakdown = [
    { label: "Mileage Cost", amount: catMileage },
    { label: "Meals",   amount: catMeals   },
    { label: "Lodge",   amount: catLodging },
    { label: "Other",   amount: catOther   },
  ].filter(c => c.amount > 0);
  const expBreakdown = isDemoMode ? DEMO.expenseBreakdown : liveExpBreakdown;

  // Pending approvals (managers/admins/finance)
  // Monthly hours for chart
  const monthlyHours = Array(12).fill(0);
  for (const t of (monthlyTsRes.data ?? []) as any[]) {
    const m = (t.month ?? 1) - 1;
    const hrs = (t.timesheet_rows ?? []).reduce((s: number, r: any) => s + (r.weekly_total ?? 0), 0);
    if (m >= 0 && m < 12) monthlyHours[m] += hrs;
  }

  // Fetch directory members in same department for manager search (paginate past 1000 limit)
  const adminDb: any = createServiceClient();
  const userDept = (realProfile?.department ?? "").toLowerCase().trim();
  const allDir: any[] = [];
  let dirFrom = 0;
  while (true) {
    let query = adminDb
      .from("directory_members")
      .select("azure_user_id, display_name, profile_id, department")
      .not("display_name", "is", null)
      .order("display_name")
      .range(dirFrom, dirFrom + 999);
    if (userDept) {
      query = query.ilike("department", userDept);
    }
    const { data } = await query;
    if (!data || data.length === 0) break;
    allDir.push(...data);
    if (data.length < 1000) break;
    dirFrom += 1000;
  }
  const managers = allDir
    .filter((m: any) => m.display_name && /^[a-zA-Z]/.test(m.display_name))
    .map((m: any) => ({ id: m.profile_id ?? m.azure_user_id, display_name: m.display_name }));

  // Get the employee's assigned manager — try employee_manager first, then directory_members
  let defaultManagerId = "";
  const { data: emRow }: any = await supabase
    .from("employee_manager")
    .select("manager_id")
    .eq("employee_id", user.id)
    .maybeSingle();
  if (emRow?.manager_id) {
    defaultManagerId = emRow.manager_id;
  } else {
    const { data: myDir }: any = await adminDb
      .from("directory_members")
      .select("manager_azure_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (myDir?.manager_azure_id) {
      const mgr = allDir.find((m: any) => m.azure_user_id === myDir.manager_azure_id);
      if (mgr) defaultManagerId = mgr.profile_id ?? mgr.azure_user_id;
    }
  }

  const pendingEx = (pendingExRes.data ?? []) as any[];
  const pendingTs = (pendingTsRes.data ?? []) as any[];
  const pendingLeave = (pendingLeaveRes.data ?? []) as any[];
  const pendingItems = [
    ...pendingEx.map((e: any) => ({
      id: e.id, type: "expense" as const,
      name: (e.employee as any)?.display_name ?? "—",
      period: `${e.year} Wk${e.week_number}`,
      submittedAt: e.submitted_at as string | null,
      href: `/approvals/${e.id}?type=expense`,
    })),
    ...pendingTs.map((t: any) => ({
      id: t.id, type: "timesheet" as const,
      name: (t.employee as any)?.display_name ?? "—",
      period: `${MONTH_NAMES[t.month ?? 1]} Wk${t.week_number}`,
      submittedAt: t.submitted_at as string | null,
      href: `/approvals/${t.id}?type=timesheet`,
    })),
    ...pendingLeave.map((l: any) => ({
      id: l.id, type: "leave" as const,
      name: (l.employee as any)?.display_name ?? "—",
      period: `${l.leave_type}`,
      submittedAt: l.submitted_at as string | null,
      href: `/approvals/${l.id}?type=leave`,
    })),
  ].sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")).slice(0, 6);
  const pendingTotal = pendingEx.length + pendingTs.length + pendingLeave.length;

  const dotForStatus = (s: string) =>
    s === "approved" ? "check-green" : s === "manager_approved" ? "check-blue" : s === "submitted" ? "pending-gray" : s === "manager_rejected" ? "rejected-orange" : s === "rejected" ? "rejected-red" : "ring-blue";

  // My Requests
  const requests = isDemoMode ? DEMO.requests : [
    ...realTimesheets.slice(0, 3).map((t:any) => ({
      id: t.id, kind: "timesheet", label: "Time Sheet",
      sub: `${MONTH_NAMES[t.month ?? 1]} Wk${t.week_number}`,
      dot: dotForStatus(t.status),
    })),
    ...realExpenses.slice(0, 2).map((e:any) => ({
      id: e.id, kind: "expense", label: "Expense",
      sub: `${e.year} Wk${e.week_number}`,
      dot: dotForStatus(e.status),
    })),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto" data-scroll-container style={{ background: "#e8eaef" }}>

      {/* ══════════════════ PAGE HEADER ══════════════════ */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl mx-4 mt-3 mb-4 px-6 pt-4 pb-3 shadow-sm">
        <p className="text-[11px] text-gray-400 mb-1">
          Portal / <span className="text-primary font-medium">Dashboard</span>
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Greeting — capped to profile column width */}
          <h1 className="text-[34px] font-bold text-gray-900 leading-tight">
            Good {getGreeting()} {firstName}!
          </h1>
          <div className="flex-1" />
          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
              </svg>
              {format(new Date(), "MMMM d, yyyy")}
            </span>
            <Link href={newExHref} className="flex items-center gap-1.5 bg-gray-900 text-white text-sm font-semibold px-4 py-1.5 rounded-xl hover:bg-gray-800 transition-colors">
              Quick Add
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </Link>
          </div>
        </div>
      </div>


      {/* ══════════════════ 3-COLUMN GRID ══════════════════ */}
      <div className="px-4 pb-4">
        <div
          className="grid gap-4 grid-cols-1 lg:grid-cols-[310px_1fr_300px]"
        >

          {/* ══ LEFT: Profile card + Pending Approvals ══ */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm relative overflow-hidden">

              {/* Photo area — 3:4 ratio, interactive upload */}
              <ProfileImageUpload
                userId={user.id}
                currentAvatar={avatarUrl}
                displayName={displayName}
                initials={initials}
              />

              {/* Floating name card — overlaid at bottom of image */}
              <div className="absolute bottom-4 left-3 right-3 bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3">
                <Link href="/settings" className="flex-1 min-w-0 group">
                  <h2 className="font-extrabold text-primary text-[18px] leading-tight truncate">
                    {displayName}
                  </h2>
                  <p className="text-[13px] font-medium text-gray-600 mt-0.5">{jobTitle}</p>
                </Link>
              </div>

            </div>

            {/* ── Manager / Admin / Finance: Pending Approvals Inbox ── */}
            {isApprover && (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 shrink-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800 text-sm">Pending Approvals</h3>
                    {pendingTotal > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {pendingTotal}
                      </span>
                    )}
                  </div>
                  <Link href="/approvals" className="text-[11px] text-primary font-semibold hover:text-primary/80">
                    View all
                  </Link>
                </div>

                {pendingItems.length === 0 ? (
                  <div className="flex flex-col items-center py-3 gap-1">
                    <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium">All caught up!</p>
                    <p className="text-[10px] text-gray-300">No items awaiting review</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {pendingItems.map(item => (
                      <Link key={item.id} href={item.href}>
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${item.type === "timesheet" ? "bg-blue-100" : item.type === "leave" ? "bg-amber-100" : "bg-orange-100"}`}>
                            {item.type === "timesheet" ? (
                              <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                              </svg>
                            ) : item.type === "leave" ? (
                              <svg className="w-3.5 h-3.5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-orange-600" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-gray-800 truncate">{item.name}</p>
                            <p className="text-[10px] text-gray-400 capitalize">{item.type} · {item.period}</p>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0"/>
                        </div>
                      </Link>
                    ))}
                    {pendingTotal > 6 && (
                      <Link href="/approvals" className="block text-center text-[11px] text-primary font-semibold py-1 hover:text-primary/80">
                        +{pendingTotal - 6} more
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ CENTER: Overview + Progress ══ */}
          <div className="flex flex-col gap-4">

            {/* ─── Overview card: tabbed timesheets / expenses / leave ─── */}
            <OverviewTabsCard
              year={year}
              month={month}
              week={week}
              realTimesheets={realTimesheets as any[]}
              realExpenses={realExpenses as any[]}
              newExHref={newExHref}
              userRole={role as any}
              userId={user.id}
              managers={managers}
              defaultManagerId={defaultManagerId}
            />

            <HoursChart monthlyHours={monthlyHours} year={year} />

          </div>

          {/* ══ RIGHT: Expense + My Requests ══ */}
          <div className="flex flex-col gap-4">

            {/* Expense card — pixel-perfect reference design */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 pt-4 pb-4 shrink-0">

              {/* Header row: "Week N Expense" label left, total amount right */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex flex-col mt-1">
                  <span className="text-[15px] font-semibold text-gray-700">Expense</span>
                  <span className="text-[11px] text-gray-400 font-medium">Week {parseInt(isoWeek)}, {year}</span>
                </div>
                <span className="text-[38px] font-extrabold text-gray-900 leading-none tracking-tight">
                  ${isDemoMode ? DEMO.monthlyExpenses : weeklyExpenses.toFixed(0)}
                </span>
              </div>

              {expBreakdown.length > 0 ? (
                <>
                  {/* Category labels row — proportional flex widths match bars below */}
                  <div className="flex gap-1 mb-1.5">
                    {expBreakdown.map((b) => (
                      <div key={b.label} style={{ flex: b.amount, minWidth: 0 }}>
                        <p className="text-[11px] font-medium text-gray-600 truncate">
                          {b.label} ${typeof b.amount === "number" ? b.amount.toFixed(0) : b.amount}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Proportional stripe bars */}
                  <div className="flex gap-1">
                    {expBreakdown.map((b, i) => {
                      const isFirst = i === 0;
                      const isLast  = i === expBreakdown.length - 1;
                      const STRIPES = [
                        /* Mileage — solid orange-red  */ "#f97316",
                        /* Meals   — orange, fine      */ "repeating-linear-gradient(135deg,#fb923c 0px,#fb923c 4px,#fed7aa 4px,#fed7aa 8px)",
                        /* Lodge   — amber, fine       */ "repeating-linear-gradient(135deg,#fbbf24 0px,#fbbf24 4px,#fef3c7 4px,#fef3c7 8px)",
                        /* Other   — lime, fine        */ "repeating-linear-gradient(135deg,#84cc16 0px,#84cc16 4px,#ecfccb 4px,#ecfccb 8px)",
                      ];
                      return (
                        <div
                          key={b.label}
                          style={{
                            flex: b.amount,
                            height: "44px",
                            background: STRIPES[i % STRIPES.length],
                            borderRadius: isFirst && isLast ? "10px"
                              : isFirst ? "10px 4px 4px 10px"
                              : isLast  ? "4px 10px 10px 4px"
                              : "4px",
                          }}
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                /* No category data — fallback to recent expense links */
                <div className="flex items-center gap-2">
                  {realExpenses.slice(0, 3).map((ex:any, i:number) => {
                    const clr = [["bg-amber-100","text-amber-700"],["bg-pink-100","text-pink-600"],["bg-sky-100","text-sky-600"]][i] ?? ["bg-gray-100","text-gray-600"];
                    return (
                      <Link key={ex.id} href={`/expenses/${ex.id}`} className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${clr[0]} ${clr[1]}`}>
                        Wk{ex.week_number}
                      </Link>
                    );
                  })}
                  {realExpenses.length === 0 && (
                    <p className="text-xs text-gray-400">No expenses this year</p>
                  )}
                </div>
              )}
            </div>

            {/* My Requests — paginated client component */}
            <MyRequestsCard requests={requests} />

          </div>
        </div>
      </div>
      </div>{/* end flex-1 scroll wrapper */}
    </div>
  );
}
