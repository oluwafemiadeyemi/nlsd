"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Search, Settings, X, Receipt, Users, LogOut, ShieldCheck, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface SearchResult {
  id: string;
  type: "expense" | "person";
  label: string;
  sublabel: string;
  href: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface NavItem {
  href: string;
  label: string;
  roles: Array<"employee" | "manager" | "admin" | "finance">;
  teamHref?: Record<string, string>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["employee", "manager", "admin", "finance"] },
  { href: "/timesheets", label: "Time Sheet", roles: ["employee", "manager", "admin", "finance"] },
  { href: "/expenses", label: "Expense", roles: ["employee", "manager", "admin", "finance"] },
  { href: "/leave", label: "Leave", roles: ["employee", "manager", "admin", "finance"] },
  { href: "/approvals", label: "Team", roles: ["manager", "admin", "finance"], teamHref: { manager: "/approvals", admin: "/people", finance: "/approvals" } },
  { href: "/reports", label: "Documents", roles: ["manager", "admin", "finance"] },
];

interface TopNavProps {
  role?: "employee" | "manager" | "admin" | "finance";
  pendingApprovals?: number;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
}

export function TopNav({
  role = "employee",
  pendingApprovals = 0,
  userName = "",
  userEmail = "",
  userAvatar,
}: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const [pageScrolled, setPageScrolled] = useState(false);

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    let container: HTMLElement | null = null;
    function check() {
      if (!container) container = document.querySelector("[data-scroll-container]");
      setPageScrolled((container?.scrollTop ?? 0) > 0);
    }
    const t = setTimeout(() => {
      container = document.querySelector("[data-scroll-container]");
      if (container) {
        check();
        container.addEventListener("scroll", check, { passive: true });
      }
    }, 50);
    return () => {
      clearTimeout(t);
      container?.removeEventListener("scroll", check);
    };
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setAvatarOpen(false); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data: matchingProfiles }: any = await (supabase.from as any)("profiles").select("id, display_name, email")
          .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`).limit(10);
        const employeeIds = (matchingProfiles ?? []).map((p: any) => p.id);
        const [ex]: any[] = await Promise.all([
          employeeIds.length > 0
            ? (supabase.from as any)("expense_reports").select("id, year, week_number, status").in("employee_id", employeeIds).limit(5)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        setResults([
          ...(ex.data ?? []).map((e: any) => ({ id: e.id, type: "expense" as const, label: `Expenses — ${e.year} Wk${e.week_number}`, sublabel: e.status, href: `/expenses/${e.id}` })),
          ...(matchingProfiles ?? []).map((p: any) => ({ id: p.id, type: "person" as const, label: p.display_name, sublabel: p.email, href: `/people/${p.id}` })),
        ]);
      } finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const iconFor = { expense: Receipt, person: Users };
  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  function navHref(item: NavItem) {
    if (item.teamHref && role in item.teamHref) return item.teamHref[role];
    return item.href;
  }

  function isActive(item: NavItem) {
    const href = navHref(item);
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href) || pathname.startsWith(item.href);
  }

  const initials = userName.charAt(0).toUpperCase() || "U";

  return (
    <header className="h-20 bg-white flex items-center px-5 gap-3 shrink-0 sticky top-0 z-30 relative no-print">
      {/* Logo */}
      <div className="flex items-center shrink-0">
        <img src="/company-logo.jpg" alt="NLSD" style={{ height: "72px" }} className="w-auto object-contain" />
      </div>

      {/* Nav pills */}
      <nav className="flex items-center gap-1.5 ml-[228px]">
        {visibleNavItems.map((item) => {
          const href = navHref(item);
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "px-4 py-1.5 rounded-2xl text-sm font-medium transition-all whitespace-nowrap border",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "text-gray-500 border-gray-200 bg-gray-50/80 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-800"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative w-56">
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors bg-gray-50/80"
          >
            <Search className="w-4 h-4 shrink-0 text-gray-400" />
            <span className="flex-1 text-left text-xs text-gray-400">Search everything...</span>
          </button>

          {searchOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden min-w-[340px]">
                <div className="flex items-center border-b border-gray-100 px-3">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search timesheets, expenses, people…"
                    className="flex-1 py-3 px-2 text-sm bg-transparent outline-none"
                  />
                  <button onClick={() => { setSearchOpen(false); setQuery(""); }}>
                    <X className="w-4 h-4 text-gray-400 hover:text-gray-700" />
                  </button>
                </div>
                {results.length > 0 ? (
                  <ul className="py-2 max-h-72 overflow-y-auto">
                    {results.map((r) => {
                      const Icon = iconFor[r.type];
                      return (
                        <li key={r.id}>
                          <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                            onClick={() => { router.push(r.href); setSearchOpen(false); setQuery(""); }}
                          >
                            <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{r.label}</p>
                              <p className="text-xs text-gray-400 truncate">{r.sublabel}</p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-gray-400">
                    {searchLoading ? "Searching…" : query.trim() ? "No results found" : "Type to search"}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Notifications bell */}
        <button
          onClick={() => router.push("/approvals")}
          className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
          title="Approvals"
        >
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {pendingApprovals > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
          )}
        </button>

        {/* Avatar with dropdown (includes settings) */}
        <div className="relative" ref={avatarRef}>
          <button onClick={() => setAvatarOpen((v) => !v)} className="flex items-center rounded-full overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
              {userAvatar ? (
                <img src={userAvatar} alt="" className="w-full h-full object-cover" />
              ) : initials}
            </div>
          </button>
          {avatarOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 py-1.5 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold truncate">{userName}</p>
                <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              </div>
              {/* Settings */}
              <Link href="/settings" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                <Settings className="w-4 h-4 text-gray-400" />Settings
              </Link>
              {(role === "admin" || role === "finance") && (
                <>
                  <Link href="/admin" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <ShieldCheck className="w-4 h-4 text-gray-400" />Admin
                  </Link>
                  <Link href="/admin/directory-health" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <HeartPulse className="w-4 h-4 text-gray-400" />Dir. Health
                  </Link>
                </>
              )}
              <div className="my-1 border-t border-gray-100" />
              {/* Sign out */}
              <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left">
                <LogOut className="w-4 h-4 text-gray-400" />Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {pathname === "/dashboard" && !pageScrolled && (
        <div
          className="absolute left-0 right-0 pointer-events-none z-10"
          style={{ top: "100%", height: "28px", background: "linear-gradient(to bottom, #ffffff, rgba(255,255,255,0))" }}
        />
      )}
    </header>
  );
}
