"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { MoreHorizontal, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DrawerDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type Employer = {
  id: string;
  legalName: string;
};

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

type Clinic = {
  id: string;
  name: string;
  address: string;
};

type RequestRow = {
  id: string;
  employerId: string;
  reason: string;
  testType: "DRUG" | "ALCOHOL" | "BOTH";
  status: string;
  paid: boolean;
  resultStatus: string;
  employer: { legalName: string };
  driver: { firstName: string; lastName: string } | null;
  clinic: { id: string; name: string } | null;
  createdAt: string;
  priceCents: number;
};

type TestType = "DRUG" | "ALCOHOL" | "BOTH";

const canAssignClinic = (row: RequestRow) => row.status === "REQUESTED" && (row.paid || row.reason === "RANDOM");
const canCaptureResult = (row: RequestRow) => row.status === "REQUESTED" || row.status === "SCHEDULED";

export default function AdminTestRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [error, setError] = useState("");
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [clinicFilter, setClinicFilter] = useState("");
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultTarget, setResultTarget] = useState<RequestRow | null>(null);
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setStatusFilter(params.get("status") || "");
    setTypeFilter(params.get("type") || "");
    setClinicFilter(params.get("clinic") || "");
  }, []);

  const [form, setForm] = useState({
    employerId: "",
    driverId: "",
    testType: "DRUG" as TestType,
    reasonDetail: "USER_REQUEST"
  });

  const loadRequests = useCallback(async ({ reset = true, cursor = null }: { reset?: boolean; cursor?: string | null } = {}) => {
    setLoadingRequests(true);
    const cursorParam = !reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const res = await fetch(`/api/admin/test-requests?limit=25${cursorParam}`);
    const payload = await res.json().catch(() => ({}));
    setLoadingRequests(false);
    if (!res.ok) {
      setError(payload.error || "Failed to load requests");
      return;
    }
    setRows((prev) => (reset ? payload.items || [] : [...prev, ...(payload.items || [])]));
    setNextCursor(payload.nextCursor || null);
  }, []);

  const loadEmployers = useCallback(async () => {
    const res = await fetch("/api/admin/employers?limit=100");
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setEmployers((payload.items || []).map((row: { id: string; legalName: string }) => ({ id: row.id, legalName: row.legalName })));
    }
  }, []);

  const loadClinics = useCallback(async () => {
    const res = await fetch("/api/admin/clinics");
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setClinics(payload.clinics || []);
  }, []);

  useEffect(() => {
    void Promise.all([loadRequests(), loadEmployers(), loadClinics()]);
  }, [loadRequests, loadEmployers, loadClinics]);

  const loadDriversForEmployer = useCallback(async (employerId: string) => {
    if (!employerId) {
      setDrivers([]);
      return;
    }
    const res = await fetch(`/api/admin/employers/${employerId}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load employer detail");
      return;
    }
    setDrivers((payload.employer?.drivers || []).filter((row: Driver) => row.active));
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (typeFilter && row.testType !== typeFilter) return false;
      if (clinicFilter === "unassigned" && row.clinic) return false;
      return true;
    });
  }, [clinicFilter, rows, statusFilter, typeFilter]);

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCreateSubmitting(true);
    const res = await fetch("/api/admin/test-requests", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        employerId: form.employerId,
        driverId: form.driverId || null,
        testType: form.testType,
        reasonDetail: form.reasonDetail
      })
    });
    const payload = await res.json().catch(() => ({}));
    setCreateSubmitting(false);
    if (!res.ok) {
      setError(payload.error || "Failed to create request");
      toast.error("Create request failed", { description: payload.error || "Please review fields." });
      return;
    }
    if (payload.checkoutUrl) {
      window.open(payload.checkoutUrl, "_blank", "noopener,noreferrer");
    }
    toast.success("Request created", { description: "Checkout link opened in a new tab." });
    setCreateOpen(false);
    await loadRequests();
  }

  async function assignClinic(requestId: string, clinicId: string) {
    const res = await fetch(`/api/admin/test-requests/${requestId}/assign-clinic`, {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ clinicId })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to assign clinic");
      toast.error("Clinic assignment failed", { description: payload.error || "Unable to update request." });
      return;
    }
    toast.success("Clinic assigned", { description: `Request ${requestId} updated.` });
    await loadRequests();
  }

  async function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resultTarget) return;
    const formData = new FormData(event.currentTarget);
    if (!formData.get("resultStatus") || !formData.get("collectedAt") || !formData.get("resultDate")) {
      setError("Result status, collected date, and result date are required.");
      return;
    }

    setResultSubmitting(true);
    const res = await fetch(`/api/admin/test-requests/${resultTarget.id}/results`, {
      method: "POST",
      headers: withCsrfHeaders(),
      body: formData
    });
    const payload = await res.json().catch(() => ({}));
    setResultSubmitting(false);
    if (!res.ok) {
      setError(payload.error || "Failed to save result");
      toast.error("Result upload failed", { description: payload.error || "Please verify required fields." });
      return;
    }
    toast.success("Result captured", { description: `Request ${resultTarget.id} updated and employer notified.` });
    setResultDialogOpen(false);
    setResultTarget(null);
    await loadRequests({ reset: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test Request Queue"
        subtitle="Assign clinics, track statuses, and capture results with controlled transitions."
        actionLabel="Create Request"
        onAction={() => setCreateOpen(true)}
      />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Queue error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DrawerDialogContent>
          <DialogHeader>
            <DialogTitle>Create Request</DialogTitle>
            <DialogDescription>
              Create a paid test request and open checkout based on selected test type.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={createRequest}>
            <Select
              value={form.employerId}
              onChange={(e) => {
                const employerId = e.target.value;
                setForm((s) => ({ ...s, employerId, driverId: "" }));
                void loadDriversForEmployer(employerId);
              }}
              required
            >
              <option value="">Select employer</option>
              {employers.map((employer) => (
                <option key={employer.id} value={employer.id}>
                  {employer.legalName}
                </option>
              ))}
            </Select>
            <Select value={form.driverId} onChange={(e) => setForm((s) => ({ ...s, driverId: e.target.value }))}>
              <option value="">No driver selected</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.firstName} {driver.lastName}
                </option>
              ))}
            </Select>
            <Select value={form.reasonDetail} onChange={(e) => setForm((s) => ({ ...s, reasonDetail: e.target.value }))}>
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
              <Button type="submit" disabled={createSubmitting}>
                {createSubmitting ? "Creating..." : "Create + Checkout"}
              </Button>
            </DialogFooter>
          </form>
        </DrawerDialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Queue Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
            <option value="REQUESTED">REQUESTED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </Select>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="DRUG">DRUG</option>
            <option value="ALCOHOL">ALCOHOL</option>
            <option value="BOTH">BOTH</option>
          </Select>
          <Select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}>
            <option value="">All clinic states</option>
            <option value="unassigned">Clinic unassigned</option>
          </Select>
          <Button variant="outline" onClick={() => { setStatusFilter(""); setTypeFilter(""); setClinicFilter(""); }}>
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {!loadingRequests && filteredRows.length === 0 ? (
            <EmptyState title="No requests in queue" description="Create a test request to start processing." />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Employer / Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status Pipeline</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.id}</div>
                      <div className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.employer.legalName}</div>
                      <div className="text-xs text-muted-foreground">{row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : "No driver"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.testType}</div>
                      <div className="text-xs text-muted-foreground">{row.reason}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge value={row.status} category="testRequest" />
                        <Badge variant="secondary">REQUESTED</Badge>
                        <Badge variant="secondary">SCHEDULED</Badge>
                        <Badge variant="secondary">COMPLETED</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>${(row.priceCents / 100).toFixed(2)}</div>
                      <StatusBadge value={row.paid ? "PAID" : "PENDING"} category="payment" />
                    </TableCell>
                    <TableCell>{row.clinic?.name || "Not assigned"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canAssignClinic(row) ? (
                            clinics.map((clinic) => (
                              <DropdownMenuItem key={`${row.id}-${clinic.id}`} onClick={() => void assignClinic(row.id, clinic.id)}>
                                Assign clinic: {clinic.name}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled>Clinic assignment unavailable</DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={!canCaptureResult(row)}
                            onClick={() => {
                              setResultTarget(row);
                              setResultDialogOpen(true);
                            }}
                          >
                            Capture result
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {nextCursor ? (
            <div className="mt-4">
              <Button variant="outline" onClick={() => void loadRequests({ reset: false, cursor: nextCursor })}>
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capture Result</DialogTitle>
            <DialogDescription>
              {resultTarget ? `Request ${resultTarget.id} for ${resultTarget.employer.legalName}` : "Select a request"}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submitResult}>
            <Select name="resultStatus" required defaultValue="NEGATIVE">
              <option value="NEGATIVE">NEGATIVE</option>
              <option value="POSITIVE">POSITIVE</option>
              <option value="REFUSAL">REFUSAL</option>
              <option value="CANCELLED">CANCELLED</option>
            </Select>
            <Input name="collectedAt" type="date" required />
            <Input name="resultDate" type="date" required />
            <textarea name="notes" className="min-h-24 rounded-md border border-input bg-background p-3 text-sm" placeholder="Result notes" />
            <label className="grid gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload result documents</span>
              <Input name="files" type="file" multiple />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResultDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resultSubmitting}>
                {resultSubmitting ? "Saving..." : "Save Result + Upload + Email"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
