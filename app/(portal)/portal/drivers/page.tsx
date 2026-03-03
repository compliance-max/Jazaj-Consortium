"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  cdlNumber: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  dotCovered: boolean;
  active: boolean;
  currentPool: {
    id: string;
    type: "MASTER" | "INDIVIDUAL";
    dotAgency: "FMCSA";
    cadence: "QUARTERLY";
  } | null;
};

type DriverForm = {
  firstName: string;
  lastName: string;
  dob: string;
  cdlNumber: string;
  state: string;
  email: string;
  phone: string;
  dotCovered: boolean;
  active: boolean;
};

const initialForm: DriverForm = {
  firstName: "",
  lastName: "",
  dob: "",
  cdlNumber: "",
  state: "",
  email: "",
  phone: "",
  dotCovered: true,
  active: true
};

export default function PortalDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState<DriverForm>(initialForm);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDriver, setConfirmDriver] = useState<Driver | null>(null);

  async function loadDrivers() {
    const res = await fetch("/api/portal/drivers");
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load drivers");
      return;
    }
    setDrivers(payload.drivers || []);
  }

  useEffect(() => {
    void loadDrivers();
  }, []);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const haystack = `${driver.firstName} ${driver.lastName} ${driver.cdlNumber || ""} ${driver.email || ""}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [drivers, search]);

  function openCreate() {
    setEditorMode("create");
    setEditingId(null);
    setDriverForm(initialForm);
    setEditorOpen(true);
  }

  function openEdit(driver: Driver) {
    setEditorMode("edit");
    setEditingId(driver.id);
    setDriverForm({
      firstName: driver.firstName,
      lastName: driver.lastName,
      dob: driver.dob.slice(0, 10),
      cdlNumber: driver.cdlNumber || "",
      state: driver.state || "",
      email: driver.email || "",
      phone: driver.phone || "",
      dotCovered: driver.dotCovered,
      active: driver.active
    });
    setEditorOpen(true);
  }

  async function saveDriver(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const isCreate = editorMode === "create";
    const res = await fetch("/api/portal/drivers", {
      method: isCreate ? "POST" : "PUT",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...(isCreate ? {} : { id: editingId }),
        ...driverForm,
        cdlNumber: driverForm.cdlNumber || null,
        state: driverForm.state || null,
        email: driverForm.email || null,
        phone: driverForm.phone || null
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to save driver");
      toast.error("Driver save failed", { description: payload.error || "Please verify required fields." });
      return;
    }

    toast.success(isCreate ? "Driver created" : "Driver updated");
    setEditorOpen(false);
    setEditingId(null);
    setDriverForm(initialForm);
    await loadDrivers();
  }

  async function deactivate() {
    if (!confirmDriver) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/portal/drivers", {
      method: "DELETE",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: confirmDriver.id })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to deactivate driver");
      toast.error("Deactivate failed", { description: payload.error || "Unable to update driver." });
      return;
    }
    toast.success("Driver deactivated");
    setConfirmOpen(false);
    setConfirmDriver(null);
    await loadDrivers();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Drivers" subtitle="Maintain your active driver roster used for random pool eligibility." actionLabel="Add Driver" onAction={openCreate} />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Driver roster error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent>
          <Input placeholder="Search by name, CDL, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver List</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredDrivers.length === 0 ? (
            <EmptyState title="No drivers yet" description="Add your first driver to start building your testing roster." ctaLabel="Add Driver" onCta={openCreate} />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>CDL</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.firstName} {driver.lastName}</TableCell>
                    <TableCell>{driver.cdlNumber || "-"}</TableCell>
                    <TableCell>{driver.state || "-"}</TableCell>
                    <TableCell>{driver.email || "-"}</TableCell>
                    <TableCell><StatusBadge value={driver.active ? "ACTIVE" : "INACTIVE"} category="employer" /></TableCell>
                    <TableCell>{driver.currentPool ? `${driver.currentPool.type}` : "-"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(driver)}>Edit Driver</DropdownMenuItem>
                          {driver.active ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setConfirmDriver(driver);
                                setConfirmOpen(true);
                              }}
                            >
                              Deactivate Driver
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
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DrawerDialogContent>
          <DialogHeader>
            <DialogTitle>{editorMode === "create" ? "Add Driver" : "Edit Driver"}</DialogTitle>
            <DialogDescription>Driver data is used in roster and random eligibility workflows.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveDriver}>
            <Input placeholder="First name" value={driverForm.firstName} onChange={(e) => setDriverForm((s) => ({ ...s, firstName: e.target.value }))} required />
            <Input placeholder="Last name" value={driverForm.lastName} onChange={(e) => setDriverForm((s) => ({ ...s, lastName: e.target.value }))} required />
            <Input type="date" value={driverForm.dob} onChange={(e) => setDriverForm((s) => ({ ...s, dob: e.target.value }))} required />
            <Input placeholder="CDL number" value={driverForm.cdlNumber} onChange={(e) => setDriverForm((s) => ({ ...s, cdlNumber: e.target.value }))} />
            <Input placeholder="State" value={driverForm.state} onChange={(e) => setDriverForm((s) => ({ ...s, state: e.target.value }))} />
            <Input type="email" placeholder="Driver email" value={driverForm.email} onChange={(e) => setDriverForm((s) => ({ ...s, email: e.target.value }))} />
            <Input placeholder="Driver phone" value={driverForm.phone} onChange={(e) => setDriverForm((s) => ({ ...s, phone: e.target.value }))} />
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>{loading ? "Saving..." : editorMode === "create" ? "Add Driver" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DrawerDialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Driver</DialogTitle>
            <DialogDescription>
              {confirmDriver ? `Deactivate ${confirmDriver.firstName} ${confirmDriver.lastName}?` : "Confirm deactivation"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deactivate()} disabled={loading}>
              Confirm Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
