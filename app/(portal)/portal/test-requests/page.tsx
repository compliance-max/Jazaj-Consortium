"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DrawerDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
};

type TestType = "DRUG" | "ALCOHOL" | "BOTH";
type ReasonDetail = "PRE_EMPLOYMENT" | "POST_ACCIDENT" | "REASONABLE_SUSPICION" | "USER_REQUEST";

type RequestRow = {
  id: string;
  reason: string;
  testType: "DRUG" | "ALCOHOL" | "BOTH";
  status: string;
  paid: boolean;
  priceCents: number;
  resultStatus: string;
  createdAt: string;
  driver: Driver | null;
};

const pricing: Record<TestType, number> = {
  DRUG: 75,
  ALCOHOL: 50,
  BOTH: 125
};

export default function PortalTestRequestsPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    driverId: "",
    testType: "DRUG" as TestType,
    reasonDetail: "USER_REQUEST" as ReasonDetail
  });

  async function load() {
    setLoading(true);
    const [driverRes, requestRes] = await Promise.all([fetch("/api/portal/drivers"), fetch("/api/portal/test-requests")]);
    const driverPayload = await driverRes.json().catch(() => ({}));
    const requestPayload = await requestRes.json().catch(() => ({}));
    setLoading(false);
    if (!driverRes.ok) {
      setError(driverPayload.error || "Failed to load drivers");
      return;
    }
    if (!requestRes.ok) {
      setError(requestPayload.error || "Failed to load requests");
      return;
    }
    setDrivers((driverPayload.drivers || []).filter((row: { active: boolean }) => row.active));
    setRows(requestPayload.requests || []);
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false;
        if (typeFilter && row.testType !== typeFilter) return false;
        return true;
      }),
    [rows, statusFilter, typeFilter]
  );

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCreating(true);
    const res = await fetch("/api/portal/test-requests", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        driverId: form.driverId || null,
        testType: form.testType,
        reasonDetail: form.reasonDetail
      })
    });
    const payload = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(payload.error || "Create failed");
      toast.error("Request creation failed", { description: payload.error || "Please verify form details." });
      return;
    }
    if (payload.checkoutUrl) {
      window.location.href = payload.checkoutUrl;
      return;
    }
    toast.success("Request created");
    setCreateOpen(false);
    await load();
  }

  async function payNow(requestId: string) {
    setError("");
    const res = await fetch(`/api/portal/test-requests/${requestId}/checkout`, {
      method: "POST",
      headers: withCsrfHeaders()
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Unable to open payment");
      return;
    }
    if (payload.checkoutUrl) {
      window.location.href = payload.checkoutUrl;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Test Requests" subtitle="Create paid test requests and track fulfillment status." actionLabel="Create Request" onAction={() => setCreateOpen(true)} />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Request error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
            <option value="REQUESTED">REQUESTED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </Select>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All test types</option>
            <option value="DRUG">DRUG</option>
            <option value="ALCOHOL">ALCOHOL</option>
            <option value="BOTH">BOTH</option>
          </Select>
          <Button variant="outline" onClick={() => { setStatusFilter(""); setTypeFilter(""); }}>
            Clear
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request History</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && filteredRows.length === 0 ? (
            <EmptyState title="No requests found" description="Create your first test request to begin." ctaLabel="Create Request" onCta={() => setCreateOpen(true)} />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.id}</TableCell>
                    <TableCell>{row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : "-"}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.testType}</TableCell>
                    <TableCell><StatusBadge value={row.status} category="testRequest" /></TableCell>
                    <TableCell>
                      <div>${(row.priceCents / 100).toFixed(2)}</div>
                      <StatusBadge value={row.paid ? "PAID" : "PENDING"} category="payment" />
                    </TableCell>
                    <TableCell><StatusBadge value={row.resultStatus} category="result" /></TableCell>
                    <TableCell>
                      {!row.paid && row.status === "PENDING_PAYMENT" ? (
                        <Button size="sm" onClick={() => void payNow(row.id)}>Pay now</Button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DrawerDialogContent>
          <DialogHeader>
            <DialogTitle>Create Test Request</DialogTitle>
            <DialogDescription>
              Select request reason and type. Estimated price: ${pricing[form.testType]}.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={createRequest}>
            <Select value={form.driverId} onChange={(e) => setForm((s) => ({ ...s, driverId: e.target.value }))}>
              <option value="">No driver selected</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.firstName} {driver.lastName}
                </option>
              ))}
            </Select>
            <Select value={form.reasonDetail} onChange={(e) => setForm((s) => ({ ...s, reasonDetail: e.target.value as ReasonDetail }))}>
              <option value="USER_REQUEST">General request</option>
              <option value="PRE_EMPLOYMENT">Pre-employment</option>
              <option value="POST_ACCIDENT">Post-accident</option>
              <option value="REASONABLE_SUSPICION">Reasonable suspicion</option>
            </Select>
            <Select value={form.testType} onChange={(e) => setForm((s) => ({ ...s, testType: e.target.value as TestType }))}>
              <option value="DRUG">Drug ($75)</option>
              <option value="ALCOHOL">Alcohol ($50)</option>
              <option value="BOTH">Both ($125)</option>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create + Pay"}</Button>
            </DialogFooter>
          </form>
        </DrawerDialogContent>
      </Dialog>
    </div>
  );
}
