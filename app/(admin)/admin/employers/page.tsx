"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type EmployerRow = {
  id: string;
  legalName: string;
  dotNumber: string | null;
  email: string;
  status: "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE";
  timezone: string;
  poolMode: "MASTER" | "INDIVIDUAL";
  renewalDueDate: string | null;
  activePool: {
    id: string;
    type: "MASTER" | "INDIVIDUAL";
  } | null;
  _count: { drivers: number };
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    emailVerifiedAt: string | null;
    passwordSet: boolean;
  }>;
};

export default function AdminEmployersPage() {
  const [rows, setRows] = useState<EmployerRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "drivers">("name");
  const [statusFilter, setStatusFilter] = useState<"" | "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE">("");
  const [renewalFilter, setRenewalFilter] = useState<"" | "dueSoon">("");
  const [runYear, setRunYear] = useState<number>(new Date().getUTCFullYear());
  const [runQuarter, setRunQuarter] = useState<number>(Math.floor(new Date().getUTCMonth() / 3) + 1);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setStatusFilter((params.get("status") as "" | "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE") || "");
    setRenewalFilter((params.get("renewal") as "" | "dueSoon") || "");
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    legalName: "",
    dotNumber: "",
    address: "",
    phone: "",
    email: "",
    timezone: "America/Detroit",
    poolMode: "INDIVIDUAL" as "MASTER" | "INDIVIDUAL",
    derEmail: "",
    derFullName: ""
  });

  const load = useCallback(
    async ({ reset = true, cursor = null }: { reset?: boolean; cursor?: string | null } = {}) => {
      setLoading(true);
      setError("");
      const cursorParam = !reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
      const statusParam = statusFilter ? `&status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/employers?limit=20${cursorParam}${qParam}${statusParam}`);
      const payload = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok) {
        setError(payload.error || "Failed to load employers");
        return;
      }

      setRows((prev) => (reset ? payload.items || [] : [...prev, ...(payload.items || [])]));
      setNextCursor(payload.nextCursor || null);
    },
    [q, statusFilter]
  );

  useEffect(() => {
    void load({ reset: true });
  }, [load]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortBy === "drivers") return b._count.drivers - a._count.drivers;
      return a.legalName.localeCompare(b.legalName);
    });
    if (renewalFilter === "dueSoon") {
      const now = new Date();
      const in30 = new Date();
      in30.setDate(now.getDate() + 30);
      return copy.filter((row) => {
        if (!row.renewalDueDate) return false;
        const due = new Date(row.renewalDueDate);
        return due >= now && due <= in30;
      });
    }
    return copy;
  }, [renewalFilter, rows, sortBy]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await load({ reset: true });
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFormError("");

    if (!createForm.legalName || !createForm.address || !createForm.phone || !createForm.email || !createForm.derEmail || !createForm.derFullName) {
      setLoading(false);
      setFormError("Please fill all required fields before creating the employer.");
      return;
    }

    const res = await fetch("/api/admin/employers", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...createForm,
        dotNumber: createForm.dotNumber || null
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(payload.error || "Failed to create employer");
      toast.error("Create employer failed", { description: payload.error || "Check required fields." });
      return;
    }

    toast.success("Employer created", { description: "Verification and set-password emails were queued." });
    setCreateOpen(false);
    setCreateForm({
      legalName: "",
      dotNumber: "",
      address: "",
      phone: "",
      email: "",
      timezone: "America/Detroit",
      poolMode: "INDIVIDUAL",
      derEmail: "",
      derFullName: ""
    });
    await load({ reset: true });
  }

  async function runRandomForScope(input: {
    employerId?: string;
    commit: boolean;
    force?: boolean;
    overrideReason?: string;
  }) {
    setLoading(true);
    const res = await fetch("/api/admin/jobs/run-random", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        year: runYear,
        quarter: runQuarter,
        employerId: input.employerId,
        commit: input.commit,
        dryRun: !input.commit,
        force: input.force === true,
        overrideReason: input.overrideReason
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error("Random run failed", { description: payload.error || "Unable to run selection." });
      return;
    }

    const count = payload.results?.length || 0;
    toast.success(input.commit ? "Quarterly random committed" : "Dry run completed", {
      description: `${count} pool scope(s) processed for Q${runQuarter} ${runYear}.`
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employers"
        subtitle="Manage employer accounts, pool mode, and quarterly random operations."
        actionLabel="Create Employer"
        onAction={() => setCreateOpen(true)}
      />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Employers unavailable</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load({ reset: true })}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DrawerDialogContent>
          <DialogHeader>
            <DialogTitle>Create Employer + DER</DialogTitle>
            <DialogDescription>Provision an employer account and send verification + set-password emails.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={onCreate}>
            <Input placeholder="Legal name" value={createForm.legalName} onChange={(e) => setCreateForm((s) => ({ ...s, legalName: e.target.value }))} required />
            <Input placeholder="DOT number (optional)" value={createForm.dotNumber} onChange={(e) => setCreateForm((s) => ({ ...s, dotNumber: e.target.value }))} />
            <Input placeholder="Address" value={createForm.address} onChange={(e) => setCreateForm((s) => ({ ...s, address: e.target.value }))} required />
            <Input placeholder="Phone" value={createForm.phone} onChange={(e) => setCreateForm((s) => ({ ...s, phone: e.target.value }))} required />
            <Input type="email" placeholder="Company email" value={createForm.email} onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))} required />
            <Input placeholder="Timezone" value={createForm.timezone} onChange={(e) => setCreateForm((s) => ({ ...s, timezone: e.target.value }))} required />
            <Select value={createForm.poolMode} onChange={(e) => setCreateForm((s) => ({ ...s, poolMode: e.target.value as "MASTER" | "INDIVIDUAL" }))}>
              <option value="INDIVIDUAL">INDIVIDUAL pool</option>
              <option value="MASTER">MASTER pool</option>
            </Select>
            <Input type="email" placeholder="DER email" value={createForm.derEmail} onChange={(e) => setCreateForm((s) => ({ ...s, derEmail: e.target.value }))} required />
            <Input placeholder="DER full name" value={createForm.derFullName} onChange={(e) => setCreateForm((s) => ({ ...s, derFullName: e.target.value }))} required />
            {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Employer"}
              </Button>
            </DialogFooter>
          </form>
        </DrawerDialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={onSearch}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search legal name, DOT, email" />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE")}> 
              <option value="">All statuses</option>
              <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </Select>
            <Select value={renewalFilter} onChange={(e) => setRenewalFilter(e.target.value as "" | "dueSoon")}>
              <option value="">All renewals</option>
              <option value="dueSoon">Due in next 30 days</option>
            </Select>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "drivers")}>
              <option value="name">Sort by name</option>
              <option value="drivers">Sort by driver count</option>
            </Select>
            <Button type="submit" disabled={loading}>
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quarterly Random Controls</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input type="number" value={runYear} onChange={(e) => setRunYear(Number(e.target.value || new Date().getUTCFullYear()))} />
          <Select value={String(runQuarter)} onChange={(e) => setRunQuarter(Number(e.target.value))}>
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </Select>
          <Button variant="outline" onClick={() => void runRandomForScope({ commit: false })} disabled={loading}>
            Dry Run (All Pools)
          </Button>
          <Button onClick={() => void runRandomForScope({ commit: true })} disabled={loading}>
            Commit (All Pools)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employer List</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && sortedRows.length === 0 ? (
            <EmptyState title="No employers found" description="Create your first employer account to populate this list." ctaLabel="Create Employer" onCta={() => setCreateOpen(true)} />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Employer</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Drivers</TableHead>
                  <TableHead>DER</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.legalName}</div>
                      <div className="text-xs text-muted-foreground">DOT: {row.dotNumber || "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.poolMode === "MASTER" ? "default" : "secondary"}>{row.poolMode}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">{row.activePool ? row.activePool.id : "No pool"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <StatusBadge value={row.status} category="employer" />
                        {row.status !== "ACTIVE" ? (
                          <Badge variant="destructive">Not Paid / Not Active</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{row._count.drivers}</TableCell>
                    <TableCell>
                      <div>{row.users[0]?.fullName || "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.users[0]?.email || "-"}</div>
                    </TableCell>
                    <TableCell>
                      {row.renewalDueDate ? new Date(row.renewalDueDate).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/employers/${row.id}`}>Open Detail</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={row.status !== "ACTIVE"}
                            onClick={() => void runRandomForScope({ employerId: row.id, commit: false })}
                          >
                            Dry run random
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={row.status !== "ACTIVE"}
                            onClick={() => void runRandomForScope({ employerId: row.id, commit: true })}
                          >
                            Commit random
                          </DropdownMenuItem>
                          {row.status !== "ACTIVE" ? (
                            <DropdownMenuItem
                              onClick={() => {
                                const reason = window.prompt(
                                  "Override reason for forced random run (minimum 10 characters):",
                                  "Administrative override for non-active employer random run."
                                );
                                if (!reason || reason.trim().length < 10) {
                                  toast.error("Override reason required (min 10 characters).");
                                  return;
                                }
                                void runRandomForScope({
                                  employerId: row.id,
                                  commit: true,
                                  force: true,
                                  overrideReason: reason.trim()
                                });
                              }}
                            >
                              Force commit random
                            </DropdownMenuItem>
                          ) : null}
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
              <Button variant="outline" onClick={() => void load({ reset: false, cursor: nextCursor })} disabled={loading}>
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
