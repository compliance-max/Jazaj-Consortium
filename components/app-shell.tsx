"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Home,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Home },
  { href: "/admin/employers", label: "Employers", icon: Building2 },
  { href: "/admin/test-requests", label: "Test Requests", icon: ClipboardList },
  { href: "/admin/results", label: "Results", icon: FlaskConical },
  { href: "/admin/random", label: "Random", icon: RefreshCw },
  { href: "/admin/chat", label: "Chat", icon: MessageSquare },
  { href: "/admin/reports", label: "Reports", icon: ShieldCheck }
];

const portalNav: NavItem[] = [
  { href: "/portal/dashboard", label: "Dashboard", icon: Home },
  { href: "/portal/company", label: "Company", icon: Building2 },
  { href: "/portal/drivers", label: "Drivers", icon: Users },
  { href: "/portal/random", label: "Random", icon: RefreshCw },
  { href: "/portal/test-requests", label: "Test Requests", icon: ClipboardList },
  { href: "/portal/results", label: "Results", icon: FlaskConical },
  { href: "/portal/dashboard?support=1", label: "Support", icon: MessageSquare }
];

type SessionPayload = {
  user?: {
    id?: string;
    role?: string;
    employerId?: string | null;
  };
};

function Sidebar({
  items,
  mode,
  collapsed,
  setCollapsed,
  roleLabel,
  employerName
}: {
  items: NavItem[];
  mode: "admin" | "portal";
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  roleLabel: string;
  employerName: string;
}) {
  const pathname = usePathname();
  return (
    <aside className={cn("hidden border-r border-border bg-card transition-all lg:block", collapsed ? "w-[88px]" : "w-72")}>
      <div className={cn("flex h-16 items-center border-b border-border", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/90 text-sm font-bold text-primary-foreground">
            JC
          </div>
          {!collapsed ? (
            <div>
              <p className="text-sm font-semibold">Jazaj Consortium</p>
              <p className="text-xs text-muted-foreground">Consortium Manager</p>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} aria-label="Expand sidebar">
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className={cn("space-y-2 border-b border-border p-3", collapsed ? "px-2" : "")}>
        <Badge variant={mode === "admin" ? "default" : "secondary"} className={cn("w-full justify-center", collapsed && "px-2")}>
          {roleLabel}
        </Badge>
        {!collapsed ? <p className="line-clamp-1 text-xs text-muted-foreground">{employerName}</p> : null}
      </div>
      <nav className={cn("space-y-1 p-3", collapsed ? "px-2" : "")}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                collapsed ? "justify-center" : "gap-3",
                active && "bg-muted text-foreground"
              )}
            >
              <span className={cn("absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-md bg-primary transition-opacity", active ? "opacity-100" : "opacity-0")} />
              <Icon className="h-4 w-4" />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function DashboardLayout({ children, mode }: { children: React.ReactNode; mode: "admin" | "portal" }) {
  const items = mode === "admin" ? adminNav : portalNav;
  const [collapsed, setCollapsed] = useState(false);
  const [roleLabel, setRoleLabel] = useState(mode === "admin" ? "Admin" : "Employer");
  const [employerName, setEmployerName] = useState(mode === "admin" ? "Global operations" : "Employer account");

  useEffect(() => {
    const key = `sidebar_collapsed_${mode}`;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (saved === "1") {
      setCollapsed(true);
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`sidebar_collapsed_${mode}`, collapsed ? "1" : "0");
  }, [collapsed, mode]);

  useEffect(() => {
    let active = true;
    async function loadIdentity() {
      const sessionRes = await fetch("/api/auth/session");
      const session = (await sessionRes.json().catch(() => ({}))) as SessionPayload;
      if (!active) return;
      const role = session?.user?.role || "";
      setRoleLabel(role === "CTPA_ADMIN" ? "Admin" : role === "CTPA_MANAGER" ? "Manager" : "Employer");
      if (mode === "portal" && session?.user?.employerId) {
        const companyRes = await fetch("/api/portal/company");
        const companyPayload = await companyRes.json().catch(() => ({}));
        if (!active) return;
        setEmployerName(companyPayload?.employer?.legalName || "Employer account");
      } else {
        setEmployerName("Global operations");
      }
    }
    void loadIdentity();
    return () => {
      active = false;
    };
  }, [mode]);

  const headerLabel = useMemo(() => (mode === "admin" ? "CTPA Admin Workspace" : "Employer Portal Workspace"), [mode]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <Sidebar items={items} mode={mode} collapsed={collapsed} setCollapsed={setCollapsed} roleLabel={roleLabel} employerName={employerName} />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
            <div>
              <p className="text-sm text-muted-foreground">{headerLabel}</p>
              <p className="text-sm font-medium">{employerName}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant={mode === "admin" ? "default" : "secondary"}>{roleLabel}</Badge>
              <Link href="/" className="text-muted-foreground hover:text-foreground">
                Website
              </Link>
              <Link href="/logout" className="text-muted-foreground hover:text-foreground">
                Logout
              </Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function PublicNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary" />
          <div>
            <p className="text-sm font-semibold">Jazaj Consortium</p>
            <p className="text-xs text-muted-foreground">Drug & Alcohol Testing</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/enroll" className="text-sm text-muted-foreground hover:text-foreground">
            Start Enrollment
          </Link>
          <Link href="/login" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}
