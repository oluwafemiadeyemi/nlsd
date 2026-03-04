"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Receipt,
  CheckSquare,
  Settings,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Grid3X3,
  ShieldCheck,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  managerOnly?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid3X3 },
  { href: "/timesheets", label: "Timesheets", icon: Clock },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, managerOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3, managerOnly: true },
  { href: "/people", label: "People", icon: Users, adminOnly: true },
  { href: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/directory-health", label: "Dir. Health", icon: HeartPulse, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  role?: "employee" | "manager" | "admin";
  pendingApprovals?: number;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
}

export function Sidebar({
  role = "employee",
  pendingApprovals = 0,
  userName = "",
  userEmail = "",
  userAvatar,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && role !== "admin") return false;
    if (item.managerOnly && role === "employee") return false;
    return true;
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/dashboard");
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Grid3X3 className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-white text-lg tracking-tight">NLSD</span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const badge =
            item.href === "/approvals" && pendingApprovals > 0
              ? pendingApprovals
              : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group relative",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-white" : "")} />
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {badge !== undefined && (
                    <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && badge !== undefined && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <div className={cn("flex items-center gap-3 px-2 py-2 rounded-lg", !collapsed && "min-w-0")}>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-sm font-semibold">
            {userAvatar ? (
              <img src={userAvatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              userName.charAt(0).toUpperCase() || "U"
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{userEmail}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={cn(
              "p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors",
              collapsed && "mx-auto"
            )}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
