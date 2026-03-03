"use client";

import { useEffect, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type EmployerCompany = {
  id: string;
  legalName: string;
  dotNumber: string | null;
  address: string;
  phone: string;
  email: string;
  status: "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE";
  timezone: string;
  renewalDueDate: string | null;
  poolMode: "MASTER" | "INDIVIDUAL";
  activePool: {
    id: string;
    type: "MASTER" | "INDIVIDUAL";
    dotAgency: "FMCSA";
    cadence: "QUARTERLY";
  } | null;
  certificates: Array<{
    id: string;
    status: "ACTIVE" | "VOID";
    expirationDate: string;
    document: {
      id: string;
      filename: string;
    };
  }>;
};

export default function PortalCompanyPage() {
  const [company, setCompany] = useState<EmployerCompany | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function load() {
    const res = await fetch("/api/portal/company");
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load company");
      return;
    }
    setCompany(payload.employer);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Company" subtitle="Profile, account status, renewal, and enrollment certificate." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Company load failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {statusMessage ? (
        <Alert className="border-success/40">
          <AlertTitle>Update</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {!company ? (
        <Card>
          <CardContent className="pt-6">Loading company profile...</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{company.legalName}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <p><span className="text-muted-foreground">DOT:</span> {company.dotNumber || "-"}</p>
              <p><span className="text-muted-foreground">Status:</span> <StatusBadge value={company.status} category="employer" /></p>
              <p><span className="text-muted-foreground">Address:</span> {company.address}</p>
              <p><span className="text-muted-foreground">Phone:</span> {company.phone}</p>
              <p><span className="text-muted-foreground">Email:</span> {company.email}</p>
              <p><span className="text-muted-foreground">Timezone:</span> {company.timezone}</p>
              <p><span className="text-muted-foreground">Pool mode:</span> {company.poolMode}</p>
              <p><span className="text-muted-foreground">Active pool:</span> {company.activePool ? `${company.activePool.type} (${company.activePool.id})` : "Not assigned"}</p>
              <p><span className="text-muted-foreground">Renewal due:</span> {company.renewalDueDate ? company.renewalDueDate.slice(0, 10) : "-"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enrollment Certificate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {company.certificates[0] ? (
                <>
                  <p>Certificate ID: {company.certificates[0].id}</p>
                  <p>Status: <StatusBadge value={company.certificates[0].status} category="certificate" /></p>
                  <Button
                    onClick={async () => {
                      const res = await fetch(`/api/documents/${company.certificates[0].document.id}/download`);
                      const payload = await res.json().catch(() => ({}));
                      if (!res.ok || !payload.url) {
                        setError(payload.error || "Unable to open certificate");
                        return;
                      }
                      window.open(payload.url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Download Certificate
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Certificate not available yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Renewal</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={async () => {
                  setError("");
                  const res = await fetch("/api/portal/company/renew", {
                    method: "POST",
                    headers: withCsrfHeaders()
                  });
                  const payload = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(payload.error || "Unable to start renewal checkout");
                    toast.error("Renewal failed", { description: payload.error || "Please retry." });
                    return;
                  }
                  if (payload.checkoutUrl) {
                    window.location.href = payload.checkoutUrl;
                  } else {
                    setStatusMessage("Renewal checkout started.");
                  }
                }}
              >
                Renew Annual Membership
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
