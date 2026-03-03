"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Users, Wallet, FlaskConical, RefreshCw, CalendarClock, MapPinned } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DemoChecklist } from "@/components/demo-checklist";

type DashboardKpis = {
  activeEmployers: number;
  renewalDueSoon: number;
  unpaidTestRequests: number;
  paidUnassignedClinic: number;
  resultsPending: number;
  chatsOpen: number;
  randomRunsLastQuarter: number;
  lastRandomRun: {
    id: string;
    runAt: string;
    selectedTotal: number;
  } | null;
  generatedAt: string;
};

const cards = [
  { key: "activeEmployers", label: "Active Employers", icon: Users, href: "/admin/employers?status=ACTIVE" },
  { key: "renewalDueSoon", label: "Renewal Due Soon (30d)", icon: CalendarClock, href: "/admin/employers?renewal=dueSoon" },
  { key: "unpaidTestRequests", label: "Unpaid Test Requests", icon: Wallet, href: "/admin/test-requests?status=PENDING_PAYMENT" },
  { key: "paidUnassignedClinic", label: "Paid, Clinic Unassigned", icon: MapPinned, href: "/admin/test-requests?clinic=unassigned" },
  { key: "resultsPending", label: "Pending Results", icon: FlaskConical, href: "/admin/results?resultStatus=PENDING" },
  { key: "chatsOpen", label: "Open Chats", icon: MessageSquare, href: "/admin/chat?status=OPEN" },
  { key: "randomRunsLastQuarter", label: "Random Runs (Last Quarter)", icon: RefreshCw, href: "/admin/random" }
] as const;

export default function AdminPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/dashboard");
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to load admin dashboard");
      return;
    }
    setKpis(payload);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Operational overview across employers, requests, results, random draws, and support."
      />
      <DemoChecklist mode="admin" />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key} className="transition-colors hover:border-primary/40">
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center justify-between">
                  {card.label}
                  <Icon className="h-4 w-4" />
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-semibold">{kpis?.[card.key] ?? 0}</p>}
                <Button asChild variant="ghost" className="mt-2 h-auto p-0 text-xs">
                  <Link href={card.href}>Open filtered view</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last Random Run</CardTitle>
          <CardDescription>Most recent committed selection event.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : kpis?.lastRandomRun ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm">
                  Event: <span className="font-medium">{kpis.lastRandomRun.id}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Ran at {new Date(kpis.lastRandomRun.runAt).toLocaleString()} with {kpis.lastRandomRun.selectedTotal} selections.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/random">Open Random Workspace</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No random run has been committed yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/employers">Employers</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/test-requests">Test Requests</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/results">Results</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/chat">Chat</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/reports">Reports</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/random">Random</Link>
          </Button>
        </CardContent>
      </Card>

      {kpis ? (
        <p className="text-xs text-muted-foreground">Last updated: {new Date(kpis.generatedAt).toLocaleString()}</p>
      ) : null}
    </div>
  );
}
