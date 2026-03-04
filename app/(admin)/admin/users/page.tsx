"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DrawerDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: "CTPA_ADMIN" | "CTPA_MANAGER" | "EMPLOYER_DER" | "READONLY_AUDITOR";
  employerId: string | null;
  disabledAt: string | null;
  invitedAt: string | null;
  passwordSetAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  employer: {
    id: string;
    legalName: string;
  } | null;
};

type SessionPayload = {
  user?: {
    role?: string;
  };
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRow["role"]>("");

  const [viewerRole, setViewerRole] = useState<string>("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    role: "CTPA_MANAGER" as "CTPA_ADMIN" | "CTPA_MANAGER"
  });

  const canManageAdmins = viewerRole === "CTPA_ADMIN";

  useEffect(() => {
    let active = true;
    async function loadSession() {
      const res = await fetch("/api/auth/session");
      const payload = (await res.json().catch(() => ({}))) as SessionPayload;
      if (!active) return;
      setViewerRole(payload.user?.role || "");
    }
    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(
    async ({ reset = true, cursor = null }: { reset?: boolean; cursor?: string | null } = {}) => {
      setLoading(true);
      setError("");
      const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
      const roleParam = roleFilter ? `&role=${roleFilter}` : "";
      const cursorParam = !reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/admin/users?limit=25${qParam}${roleParam}${cursorParam}`);
      const payload = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok) {
        setError(payload.error || "Failed to load users");
        return;
      }

      setRows((prev) => (reset ? payload.items || [] : [...prev, ...(payload.items || [])]));
      setNextCursor(payload.nextCursor || null);
    },
    [q, roleFilter]
  );

  useEffect(() => {
    void load({ reset: true });
  }, [load]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => a.email.localeCompare(b.email));
    return copy;
  }, [rows]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await load({ reset: true });
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canManageAdmins) {
      toast.error("Only CTPA admins can create global users.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(createForm)
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error("Create user failed", { description: payload.error || "Unable to create user." });
      return;
    }

    toast.success("User invited", { description: "Verification and set-password emails sent." });
    setCreateOpen(false);
    setCreateForm({ email: "", role: "CTPA_MANAGER" });
    await load({ reset: true });
  }

  async function resendInvite(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}/resend-invite`, {
      method: "POST",
      headers: withCsrfHeaders()
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Resend invite failed", { description: payload.error || "Unable to resend invite." });
      return;
    }
    toast.success("Invite resent");
    await load({ reset: true });
  }

  async function forceReset(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}/force-reset`, {
      method: "POST",
      headers: withCsrfHeaders()
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Force reset failed", { description: payload.error || "Unable to send reset link." });
      return;
    }
    toast.success("Reset email sent");
  }

  async function toggleDisabled(user: UserRow) {
    if (!canManageAdmins) {
      toast.error("Only CTPA admins can enable/disable users.");
      return;
    }

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ disabled: !user.disabledAt })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Update failed", { description: payload.error || "Unable to update user." });
      return;
    }
    toast.success(user.disabledAt ? "User enabled" : "User disabled");
    await load({ reset: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage global and employer-scoped users, invitations, and account lifecycle actions."
        actionLabel={canManageAdmins ? "Create Global User" : undefined}
        onAction={canManageAdmins ? () => setCreateOpen(true) : undefined}
      />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Users unavailable</AlertTitle>
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
            <DialogTitle>Create Global User</DialogTitle>
            <DialogDescription>Create a CTPA admin/manager and send verification + set-password invites.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={onCreate}>
            <Input
              type="email"
              placeholder="user@company.com"
              value={createForm.email}
              onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
              required
            />
            <Select
              value={createForm.role}
              onChange={(e) => setCreateForm((s) => ({ ...s, role: e.target.value as "CTPA_ADMIN" | "CTPA_MANAGER" }))}
            >
              <option value="CTPA_MANAGER">CTPA_MANAGER</option>
              <option value="CTPA_ADMIN">CTPA_ADMIN</option>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create User"}
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
          <form className="grid gap-3 md:grid-cols-4" onSubmit={onSearch}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, employer" />
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | UserRow["role"])}>
              <option value="">All roles</option>
              <option value="CTPA_ADMIN">CTPA_ADMIN</option>
              <option value="CTPA_MANAGER">CTPA_MANAGER</option>
              <option value="EMPLOYER_DER">EMPLOYER_DER</option>
              <option value="READONLY_AUDITOR">READONLY_AUDITOR</option>
            </Select>
            <Button type="submit" disabled={loading}>
              Apply
            </Button>
            <Button type="button" variant="outline" onClick={() => { setQ(""); setRoleFilter(""); void load({ reset: true }); }}>
              Clear
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && sortedRows.length === 0 ? (
            <EmptyState title="No users found" description="Adjust filters or create a new user invitation." />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.email}</div>
                      <div className="text-xs text-muted-foreground">{user.fullName}</div>
                    </TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.employer ? user.employer.legalName : "Global"}</TableCell>
                    <TableCell>
                      {user.disabledAt ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>}
                    </TableCell>
                    <TableCell>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</TableCell>
                    <TableCell>{user.invitedAt ? new Date(user.invitedAt).toLocaleString() : "-"}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => void resendInvite(user.id)}>
                        Resend Invite
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void forceReset(user.id)}>
                        Force Reset
                      </Button>
                      <Button
                        size="sm"
                        variant={user.disabledAt ? "outline" : "destructive"}
                        onClick={() => void toggleDisabled(user)}
                        disabled={!canManageAdmins}
                      >
                        {user.disabledAt ? "Enable" : "Disable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {nextCursor ? (
            <div className="mt-4">
              <Button variant="outline" onClick={() => void load({ reset: false, cursor: nextCursor })}>
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
