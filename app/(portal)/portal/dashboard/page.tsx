"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ChangePasswordForm from "../password-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/status-badge";
import { DemoChecklist } from "@/components/demo-checklist";

type DashboardPayload = {
  year: number;
  employer: {
    id: string;
    legalName: string;
    status: "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE";
    renewalDueDate: string | null;
  };
  compliance: {
    avgCoveredDrivers: number;
    requiredDrug: number;
    completedDrug: number;
    remainingDrug: number;
    requiredAlcohol: number;
    completedAlcohol: number;
    remainingAlcohol: number;
  } | null;
};

type CompanyPayload = {
  employer: {
    certificates: Array<{
      id: string;
      status: "ACTIVE" | "VOID";
      document: {
        id: string;
        filename: string;
      };
    }>;
  };
};

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [companyData, setCompanyData] = useState<CompanyPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [dashboardRes, companyRes] = await Promise.all([fetch("/api/portal/dashboard"), fetch("/api/portal/company")]);
    const dashboardPayload = await dashboardRes.json().catch(() => ({}));
    const companyPayload = await companyRes.json().catch(() => ({}));
    setLoading(false);
    if (!dashboardRes.ok) {
      setError(dashboardPayload.error || "Failed to load dashboard");
      return;
    }
    if (!companyRes.ok) {
      setError(companyPayload.error || "Failed to load company");
      return;
    }
    setData(dashboardPayload);
    setCompanyData(companyPayload);
  }

  useEffect(() => {
    void load();
  }, []);

  async function downloadCertificate() {
    const docId = companyData?.employer?.certificates?.[0]?.document?.id;
    if (!docId) return;
    const res = await fetch(`/api/documents/${docId}/download`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Unable to open certificate");
      return;
    }
    if (payload.url) {
      window.open(payload.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Portal Dashboard" subtitle="Compliance posture, renewal state, and quick access to core actions." />
      <DemoChecklist mode="portal" />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Dashboard error</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Company</CardDescription>
            <CardTitle>{loading ? <Skeleton className="h-6 w-32" /> : data?.employer.legalName || "-"}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-5 w-20" /> : <StatusBadge value={data?.employer.status || "UNKNOWN"} category="employer" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Renewal Due</CardDescription>
            <CardTitle>
              {loading ? <Skeleton className="h-6 w-32" /> : data?.employer.renewalDueDate ? new Date(data.employer.renewalDueDate).toLocaleDateString() : "-"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/portal/company">Open Company</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Enrollment Certificate</CardDescription>
            <CardTitle>{companyData?.employer?.certificates?.[0]?.id || "Not issued"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void downloadCertificate()} disabled={!companyData?.employer?.certificates?.[0]}>
              Download Enrollment Certificate
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compliance Summary ({data?.year || new Date().getUTCFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.compliance ? (
              <p className="text-sm text-muted-foreground">No compliance summary available yet for this year.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Avg Covered Drivers (YTD)</p>
                  <p className="text-2xl font-semibold">{data.compliance.avgCoveredDrivers.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Drug Remaining</p>
                  <p className="text-2xl font-semibold">{data.compliance.remainingDrug}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Alcohol Remaining</p>
                  <p className="text-2xl font-semibold">{data.compliance.remainingAlcohol}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Drug Completed / Required</p>
                  <p className="text-2xl font-semibold">
                    {data.compliance.completedDrug}/{data.compliance.requiredDrug}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild variant="outline">
              <Link href="/portal/test-requests">Create Test Request</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/drivers">Manage Drivers</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/random">View Random Selections</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/results">View Results</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Password & Security</CardTitle>
          <CardDescription>Change your portal password.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
