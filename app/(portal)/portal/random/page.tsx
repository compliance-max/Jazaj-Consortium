"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type RandomEvent = {
  id: string;
  runAt: string;
  eligibleCount: number;
  selectedCountDrug: number;
  selectedCountAlcohol: number;
  randomPeriod: {
    year: number;
    periodNumber: number;
  };
  selectedDrivers: Array<{
    id: string;
    testType: "DRUG" | "ALCOHOL" | "BOTH";
    status: "SELECTED" | "NOTIFIED" | "SCHEDULED" | "COMPLETED" | "CANCELLED" | "REPLACED";
    driver: {
      id: string;
      firstName: string;
      lastName: string;
    };
    testRequest: {
      id: string;
      status: string;
      collectedAt: string | null;
      clinic: {
        id: string;
        name: string;
        address: string;
        phone: string | null;
      } | null;
    } | null;
  }>;
};

export default function PortalRandomPage() {
  const [events, setEvents] = useState<RandomEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/portal/random");
      const payload = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setError(payload.error || "Failed to load random events");
        return;
      }
      setEvents(payload.events || []);
    }
    void load();
  }, []);

  const latest = useMemo(() => events[0] || null, [events]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Random Selections"
        subtitle="Random testing remains unannounced. Selected drivers must be sent for testing during the selection period."
      />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Random events unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {latest ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Latest Draw: Q{latest.randomPeriod.periodNumber} {latest.randomPeriod.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Selection Run</p>
              <p className="font-medium">{new Date(latest.runAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Your Selected Drivers</p>
              <p className="font-medium">{latest.selectedDrivers.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pool Eligible Count</p>
              <p className="font-medium">{latest.eligibleCount}</p>
            </div>
            <div className="md:col-span-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Next steps: 1) Notify selected driver(s) immediately. 2) Track request status and clinic assignment. 3)
              Confirm collection completion before period close.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && events.length === 0 ? (
        <EmptyState title="No random events yet" description="Your quarterly selections will appear here once generated." />
      ) : null}

      {events.map((event) => (
        <Card key={event.id}>
          <CardHeader>
            <CardTitle>
              Q{event.randomPeriod.periodNumber} {event.randomPeriod.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <p><span className="text-muted-foreground">Run at:</span> {new Date(event.runAt).toLocaleString()}</p>
              <p><span className="text-muted-foreground">Eligible:</span> {event.eligibleCount}</p>
              <p><span className="text-muted-foreground">Drug selected:</span> {event.selectedCountDrug}</p>
              <p><span className="text-muted-foreground">Alcohol selected:</span> {event.selectedCountAlcohol}</p>
            </div>
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Test Type</TableHead>
                  <TableHead>Selection Status</TableHead>
                  <TableHead>Request Status</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Clinic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.selectedDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No drivers selected for your company in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  event.selectedDrivers.map((selected) => (
                    <TableRow key={selected.id}>
                      <TableCell>{selected.driver.firstName} {selected.driver.lastName}</TableCell>
                      <TableCell>{selected.testType}</TableCell>
                      <TableCell><StatusBadge value={selected.status} category="random" /></TableCell>
                      <TableCell>{selected.testRequest ? <StatusBadge value={selected.testRequest.status} category="testRequest" /> : "-"}</TableCell>
                      <TableCell>{selected.testRequest?.collectedAt ? selected.testRequest.collectedAt.slice(0, 10) : "-"}</TableCell>
                      <TableCell>{selected.testRequest?.clinic ? `${selected.testRequest.clinic.name}` : "Not assigned"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
