"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type EmployerDetail = {
  id: string;
  legalName: string;
  dotNumber: string | null;
  address: string;
  phone: string;
  email: string;
  status: "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE";
  timezone: string;
  poolMode: "MASTER" | "INDIVIDUAL";
  activePool: {
    id: string;
    type: "MASTER" | "INDIVIDUAL";
    dotAgency: "FMCSA";
    cadence: "QUARTERLY";
    timezone: string;
  } | null;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    emailVerifiedAt: string | null;
    passwordSet: boolean;
  }>;
  drivers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    cdlNumber: string | null;
    active: boolean;
    currentPool: {
      id: string;
      type: "MASTER" | "INDIVIDUAL";
      dotAgency: "FMCSA";
      cadence: "QUARTERLY";
    } | null;
  }>;
  driverMembershipHistory: Array<{
    id: string;
    effectiveStart: string;
    effectiveEnd: string | null;
    reason: string;
    driver: { id: string; firstName: string; lastName: string };
    pool: { id: string; type: "MASTER" | "INDIVIDUAL"; dotAgency: "FMCSA"; cadence: "QUARTERLY" };
    changedByUser: { id: string; email: string } | null;
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    status: string;
    type: string;
    createdAt: string;
    paidAt: string | null;
  }>;
  certificates: Array<{
    id: string;
    status: string;
    effectiveDate: string;
    expirationDate: string;
    document: { id: string; filename: string };
  }>;
  testRequests: Array<{
    id: string;
    reason: string;
    testType: string;
    status: string;
    resultStatus: string;
    createdAt: string;
    driver: { id: string; firstName: string; lastName: string } | null;
  }>;
};

export default function EmployerDetailPage({ params }: { params: { id: string } }) {
  const [employer, setEmployer] = useState<EmployerDetail | null>(null);
  const [migrateDrivers, setMigrateDrivers] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<{
    movedDrivers: number;
    closedMemberships: number;
    createdMemberships: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/employers/${params.id}`);
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to load employer");
      return;
    }
    setEmployer(payload.employer);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employer) return;
    setLoading(true);
    const res = await fetch(`/api/admin/employers/${params.id}`, {
      method: "PUT",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        legalName: employer.legalName,
        dotNumber: employer.dotNumber,
        address: employer.address,
        phone: employer.phone,
        email: employer.email,
        status: employer.status,
        timezone: employer.timezone,
        poolMode: employer.poolMode,
        migrateDrivers
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to update employer");
      toast.error("Save failed", { description: payload.error || "Employer update could not be completed." });
      return;
    }
    setEmployer(payload.employer);
    setMigrationSummary(payload.migrationSummary || null);
    toast.success("Employer updated", { description: "Changes were saved." });
  }

  async function activateEmployer() {
    if (!employer || employer.status === "ACTIVE") return;
    const methodRaw = window.prompt("Activation method: MANUAL, INVOICE, or COMP", "MANUAL");
    const method = (methodRaw || "").trim().toUpperCase();
    if (!["MANUAL", "INVOICE", "COMP"].includes(method)) {
      toast.error("Activation method must be MANUAL, INVOICE, or COMP.");
      return;
    }
    const reason = window.prompt(
      "Override reason for manual activation (minimum 10 characters):",
      "Manual activation after enrollment payment verification."
    );
    if (!reason || reason.trim().length < 10) {
      toast.error("Override reason is required (minimum 10 characters).");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/admin/employers/${params.id}/activate`, {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        method,
        overrideReason: reason.trim()
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to activate employer");
      toast.error("Activation failed", { description: payload.error || "Unable to activate employer." });
      return;
    }
    setEmployer(payload.employer);
    toast.success("Employer activated", {
      description: `Payment and certificate generated (${payload.activation?.certificateId || "certificate ready"}).`
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Employer Detail" subtitle="Profile, drivers, random history, payments, and documents." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Unable to load employer</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!employer ? (
        <Card>
          <CardContent className="pt-6">{loading ? "Loading employer..." : "No employer found."}</CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
            <TabsTrigger value="random">Random</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                  <Input value={employer.legalName} onChange={(e) => setEmployer({ ...employer, legalName: e.target.value })} />
                  <Input value={employer.dotNumber || ""} onChange={(e) => setEmployer({ ...employer, dotNumber: e.target.value || null })} />
                  <Input value={employer.address} onChange={(e) => setEmployer({ ...employer, address: e.target.value })} />
                  <Input value={employer.phone} onChange={(e) => setEmployer({ ...employer, phone: e.target.value })} />
                  <Input value={employer.email} onChange={(e) => setEmployer({ ...employer, email: e.target.value })} />
                  <Input value={employer.timezone} onChange={(e) => setEmployer({ ...employer, timezone: e.target.value })} />
                  <Select value={employer.status} onChange={(e) => setEmployer({ ...employer, status: e.target.value as "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE" })}>
                    <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
                    <option value="ACTIVE" disabled={employer.status !== "ACTIVE"}>ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </Select>
                  <Select value={employer.poolMode} onChange={(e) => setEmployer({ ...employer, poolMode: e.target.value as "MASTER" | "INDIVIDUAL" })}>
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                    <option value="MASTER">MASTER</option>
                  </Select>
                  <label className="md:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={migrateDrivers} onChange={(e) => setMigrateDrivers(e.target.checked)} />
                    Migrate active drivers on pool mode switch
                  </label>
                  <div className="md:col-span-2 flex items-center gap-3">
                    <Button type="submit" disabled={loading}>
                      Save Employer
                    </Button>
                    {employer.status !== "ACTIVE" ? (
                      <Button type="button" variant="outline" onClick={() => void activateEmployer()} disabled={loading}>
                        Activate Employer
                      </Button>
                    ) : null}
                    <StatusBadge value={employer.status} category="employer" />
                    {employer.status !== "ACTIVE" ? <Badge variant="destructive">Not Paid / Not Active</Badge> : null}
                    <Badge variant={employer.poolMode === "MASTER" ? "default" : "secondary"}>{employer.poolMode}</Badge>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Active Pool</p>
                  <p className="font-medium">{employer.activePool ? `${employer.activePool.type}` : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Drivers</p>
                  <p className="font-medium">{employer.drivers.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">DER Users</p>
                  <p className="font-medium">{employer.users.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recent Requests</p>
                  <p className="font-medium">{employer.testRequests.length}</p>
                </div>
              </CardContent>
            </Card>

            {migrationSummary ? (
              <Alert>
                <AlertTitle>Pool migration summary</AlertTitle>
                <AlertDescription>
                  Moved {migrationSummary.movedDrivers}, closed {migrationSummary.closedMemberships}, created {migrationSummary.createdMemberships} membership records.
                </AlertDescription>
              </Alert>
            ) : null}
          </TabsContent>

          <TabsContent value="drivers">
            <Card>
              <CardHeader>
                <CardTitle>Driver Roster</CardTitle>
              </CardHeader>
              <CardContent>
                <Table compact>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>CDL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pool</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employer.drivers.map((driver) => (
                      <TableRow key={driver.id}>
                        <TableCell>{driver.firstName} {driver.lastName}</TableCell>
                        <TableCell>{driver.cdlNumber || "-"}</TableCell>
                        <TableCell><StatusBadge value={driver.active ? "ACTIVE" : "INACTIVE"} category="employer" /></TableCell>
                        <TableCell>{driver.currentPool ? `${driver.currentPool.type} (${driver.currentPool.id.slice(0, 8)}...)` : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="random" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pool Membership History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table compact>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Pool</TableHead>
                      <TableHead>Effective Start</TableHead>
                      <TableHead>Effective End</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employer.driverMembershipHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.driver.firstName} {entry.driver.lastName}</TableCell>
                        <TableCell>{entry.pool.type}</TableCell>
                        <TableCell>{entry.effectiveStart.slice(0, 10)}</TableCell>
                        <TableCell>{entry.effectiveEnd ? entry.effectiveEnd.slice(0, 10) : "ACTIVE"}</TableCell>
                        <TableCell>{entry.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Random-Linked Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <Table compact>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employer.testRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>{request.id}</TableCell>
                        <TableCell>{request.driver ? `${request.driver.firstName} ${request.driver.lastName}` : "-"}</TableCell>
                        <TableCell>{request.testType}</TableCell>
                        <TableCell><StatusBadge value={request.status} category="testRequest" /></TableCell>
                        <TableCell><StatusBadge value={request.resultStatus} category="result" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table compact>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employer.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{payment.id}</TableCell>
                        <TableCell>{payment.type}</TableCell>
                        <TableCell>${(payment.amountCents / 100).toFixed(2)}</TableCell>
                        <TableCell><StatusBadge value={payment.status} category="payment" /></TableCell>
                        <TableCell>{new Date(payment.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Enrollment Certificates</CardTitle>
              </CardHeader>
              <CardContent>
                <Table compact>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Document</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employer.certificates.map((certificate) => (
                      <TableRow key={certificate.id}>
                        <TableCell>{certificate.id}</TableCell>
                        <TableCell><StatusBadge value={certificate.status} category="certificate" /></TableCell>
                        <TableCell>{certificate.effectiveDate.slice(0, 10)}</TableCell>
                        <TableCell>{certificate.expirationDate.slice(0, 10)}</TableCell>
                        <TableCell>{certificate.document.filename}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
