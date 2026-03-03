"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, FileCheck2, Headset, MailCheck, ShieldCheck } from "lucide-react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type DriverDraft = {
  firstName: string;
  lastName: string;
  dob: string;
  cdlNumber: string;
  state: string;
  email: string;
  phone: string;
};

type ConfirmStatus = {
  paid: boolean;
  status: string | null;
  kind: string | null;
};

const emptyDriver = (): DriverDraft => ({
  firstName: "",
  lastName: "",
  dob: "",
  cdlNumber: "",
  state: "",
  email: "",
  phone: ""
});

const confirmTokenStorageKey = (sessionId: string) => `checkout-confirm:${sessionId}`;

export default function EnrollPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [returnSessionId, setReturnSessionId] = useState<string>("");
  const [form, setForm] = useState({
    legalName: "",
    dotNumber: "",
    address: "",
    phone: "",
    contactName: "",
    contactEmail: "",
    promoCode: "",
    timezone: "America/Detroit"
  });
  const [drivers, setDrivers] = useState<DriverDraft[]>([]);

  const totalDrivers = useMemo(() => drivers.filter((row) => row.firstName && row.lastName).length, [drivers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") || "";
    const promoSuccess = params.get("success") === "1";
    setReturnSessionId(sessionId);
    if (sessionId) {
      setStatus("Payment session found. Use Check Payment Status to confirm final processing.");
    } else if (promoSuccess) {
      setStatus("Enrollment complete. Check your email to verify and set your password before first login.");
    }
  }, []);

  function validateForm() {
    const next: Record<string, string> = {};
    if (!form.legalName.trim()) next.legalName = "Legal company name is required.";
    if (!form.address.trim()) next.address = "Address is required.";
    if (!form.phone.trim()) next.phone = "Phone is required.";
    if (!form.contactName.trim()) next.contactName = "Contact name is required.";
    if (!form.contactEmail.trim()) next.contactEmail = "Contact email is required.";
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
      next.contactEmail = "Enter a valid email address.";
    }
    drivers.forEach((row, index) => {
      if ((row.firstName || row.lastName || row.dob) && !(row.firstName && row.lastName && row.dob)) {
        next[`driver_${index}`] = "Complete first name, last name, and DOB for this driver row.";
      }
    });
    setValidationErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");
    setConfirmStatus(null);
    if (!validateForm()) return;

    const promoCode = form.promoCode || "";
    if (process.env.NODE_ENV !== "production") {
      console.log("ENROLL_PROMO_CLIENT", { promoCodeSent: promoCode });
    }

    setLoading(true);
    const res = await fetch("/api/enroll", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...form,
        dotNumber: form.dotNumber || null,
        promoCode: promoCode || null,
        drivers: drivers
          .filter((row) => row.firstName && row.lastName && row.dob)
          .map((row) => ({
            ...row,
            cdlNumber: row.cdlNumber || null,
            state: row.state || null,
            email: row.email || null,
            phone: row.phone || null
          }))
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Enrollment failed");
      toast.error("Enrollment failed", { description: payload.error || "Please review the form and try again." });
      return;
    }

    if (payload.checkoutSessionId && payload.confirmToken && typeof window !== "undefined") {
      sessionStorage.setItem(confirmTokenStorageKey(payload.checkoutSessionId), payload.confirmToken);
    }

    if (payload.kind === "PROMO" && payload.success && payload.redirectUrl) {
      window.location.href = payload.redirectUrl;
      return;
    }

    if (payload.checkoutUrl) {
      window.location.href = payload.checkoutUrl;
      return;
    }
    setStatus("Enrollment checkout session created.");
  }

  async function checkPaymentStatus() {
    if (!returnSessionId || typeof window === "undefined") return;
    setError("");
    setConfirmLoading(true);
    const confirmToken = sessionStorage.getItem(confirmTokenStorageKey(returnSessionId)) || "";
    const res = await fetch("/api/stripe/confirm-session", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        sessionId: returnSessionId,
        confirmToken: confirmToken || undefined
      })
    });
    const payload = await res.json().catch(() => ({}));
    setConfirmLoading(false);
    if (!res.ok) {
      setError(payload.error || "Unable to verify payment status");
      return;
    }

    setConfirmStatus(payload as ConfirmStatus);
    if (payload.paid) {
      setStatus("Enrollment complete. Check your email to verify and set your password before first login.");
      toast.success("Payment confirmed", { description: "Check your email for verification and set-password links." });
    } else {
      setStatus("Payment is not complete yet. If you just paid, wait a moment and check again.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            Enrollment Checkout
          </Badge>
          <CardTitle>Consortium Enrollment</CardTitle>
          <CardDescription>
            Step 1: Complete company details. Step 2: Pay annual enrollment. Step 3: Confirm payment and activate access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert className="border-destructive/40">
              <AlertTitle>Enrollment error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {status ? (
            <Alert className="border-success/40">
              <AlertTitle>Status</AlertTitle>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          ) : null}
          {returnSessionId ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Detected checkout session: {returnSessionId}</p>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={() => void checkPaymentStatus()} disabled={confirmLoading}>
                  {confirmLoading ? "Checking..." : "Check Payment Status"}
                </Button>
                {confirmStatus ? (
                  <span className="text-sm">
                    {confirmStatus.paid ? "Paid" : "Not paid"} ({confirmStatus.status || "unknown"})
                  </span>
                ) : null}
              </div>
              {confirmStatus?.paid ? (
                <p className="mt-3 text-sm">
                  <Link href="/login" className="text-primary hover:underline">
                    Continue to login
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold">Pricing Summary</p>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
              <p className="flex items-center justify-between"><span>Annual Enrollment</span><span className="font-medium text-foreground">$99</span></p>
              <p className="flex items-center justify-between"><span>Drug Test</span><span className="font-medium text-foreground">$75</span></p>
              <p className="flex items-center justify-between"><span>Alcohol Test</span><span className="font-medium text-foreground">$50</span></p>
              <p className="flex items-center justify-between"><span>Drug + Alcohol</span><span className="font-medium text-foreground">$125</span></p>
            </div>
          </div>

          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
            <Input
              placeholder="Legal company name"
              value={form.legalName}
              onChange={(e) => setForm((s) => ({ ...s, legalName: e.target.value }))}
              required
            />
            <Input placeholder="USDOT number" value={form.dotNumber} onChange={(e) => setForm((s) => ({ ...s, dotNumber: e.target.value }))} />
            <Input placeholder="Address" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} required />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} required />
            <Input placeholder="Contact name" value={form.contactName} onChange={(e) => setForm((s) => ({ ...s, contactName: e.target.value }))} required />
            <Input type="email" placeholder="Contact email" value={form.contactEmail} onChange={(e) => setForm((s) => ({ ...s, contactEmail: e.target.value }))} required />
            <Input
              placeholder="Promo code (optional)"
              value={form.promoCode}
              onChange={(e) => setForm((s) => ({ ...s, promoCode: e.target.value }))}
            />
            <Input placeholder="Timezone" value={form.timezone} onChange={(e) => setForm((s) => ({ ...s, timezone: e.target.value }))} required />
            <div className="md:col-span-2">
              {Object.values(validationErrors).length > 0 ? (
                <p className="text-sm text-destructive">Please resolve highlighted validation issues before submitting.</p>
              ) : null}
            </div>

            <div className="md:col-span-2 rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Initial Driver Roster (optional)</h3>
                  <p className="text-xs text-muted-foreground">Drivers included: {totalDrivers}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setDrivers((prev) => [...prev, emptyDriver()])}>
                  Add Driver
                </Button>
              </div>
              {drivers.length === 0 ? <EmptyState title="No drivers added" description="Add drivers now or complete enrollment and add later in portal." /> : null}
              <div className="space-y-3">
                {drivers.map((driver, index) => (
                  <div key={index} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-4">
                    <Input placeholder="First name" value={driver.firstName} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, firstName: e.target.value } : item)))} />
                    <Input placeholder="Last name" value={driver.lastName} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, lastName: e.target.value } : item)))} />
                    <Input type="date" value={driver.dob} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, dob: e.target.value } : item)))} />
                    <Input placeholder="CDL number" value={driver.cdlNumber} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, cdlNumber: e.target.value } : item)))} />
                    <Input placeholder="CDL state" value={driver.state} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, state: e.target.value } : item)))} />
                    <Input type="email" placeholder="Driver email" value={driver.email} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, email: e.target.value } : item)))} />
                    <Input placeholder="Driver phone" value={driver.phone} onChange={(e) => setDrivers((prev) => prev.map((item, i) => (i === index ? { ...item, phone: e.target.value } : item)))} />
                    <Button type="button" variant="destructive" onClick={() => setDrivers((prev) => prev.filter((_, i) => i !== index))}>
                      Remove
                    </Button>
                    {validationErrors[`driver_${index}`] ? <p className="text-sm text-destructive md:col-span-4">{validationErrors[`driver_${index}`]}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating checkout..." : "Start Enrollment Checkout"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What you get after payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <FileCheck2 className="mt-0.5 h-4 w-4 text-primary" />
              Enrollment certificate PDF available in your portal.
            </p>
            <p className="flex items-start gap-2">
              <MailCheck className="mt-0.5 h-4 w-4 text-primary" />
              Email confirmation with verification and set-password links.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
              Access to dashboard for drivers, requests, results, and random history.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Need help?</CardTitle>
            <CardDescription>Support can assist with enrollment and setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/enroll?support=1";
                }
              }}
            >
              <Headset className="mr-2 h-4 w-4" />
              Open Support Chat
            </Button>
            <p className="text-xs text-muted-foreground">You can also reach support at compliance@jazaj.com.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">No hidden fees</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <CircleDollarSign className="mt-0.5 h-4 w-4 text-primary" />
              Transparent annual enrollment plus fixed per-test pricing based on test type.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
