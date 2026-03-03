"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ResultRow = {
  id: string;
  employer: { id: string; legalName: string } | null;
  driver: { id: string; firstName: string; lastName: string } | null;
  testType: "DRUG" | "ALCOHOL" | "BOTH";
  resultStatus: "PENDING" | "NEGATIVE" | "POSITIVE" | "REFUSAL" | "CANCELLED";
  resultDate: string | null;
  resultReportedAt: string | null;
  collectedAt: string | null;
  notes: string | null;
  status: string;
};

export default function AdminResultsPage() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setResultFilter(params.get("resultStatus") || "");
  }, []);

  const load = useCallback(async ({ reset = true, cursor = null }: { reset?: boolean; cursor?: string | null } = {}) => {
    setLoading(true);
    const cursorParam = !reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const res = await fetch(`/api/admin/results?limit=25${cursorParam}`);
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to load results");
      return;
    }
    setRows((prev) => (reset ? payload.items || [] : [...prev, ...(payload.items || [])]));
    setNextCursor(payload.nextCursor || null);
  }, []);

  useEffect(() => {
    void load({ reset: true });
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const haystack = `${row.id} ${row.employer?.legalName || ""} ${row.driver?.firstName || ""} ${row.driver?.lastName || ""}`.toLowerCase();
      if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
      if (resultFilter && row.resultStatus !== resultFilter) return false;
      return true;
    });
  }, [rows, search, resultFilter]);

  return (
    <div className="space-y-6">
      <PageHeader title="Results" subtitle="Review finalized and pending outcomes across employers." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Failed to load results</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load({ reset: true })}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Search by ID, employer, driver" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
            <option value="">All result statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="NEGATIVE">NEGATIVE</option>
            <option value="POSITIVE">POSITIVE</option>
            <option value="REFUSAL">REFUSAL</option>
            <option value="CANCELLED">CANCELLED</option>
          </Select>
          <Button variant="outline" onClick={() => { setSearch(""); setResultFilter(""); }}>
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result Records</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && filtered.length === 0 ? (
            <EmptyState title="No results found" description="Adjust filters or capture new test outcomes from the queue." />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Reported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.id}</TableCell>
                    <TableCell>{row.employer?.legalName || "-"}</TableCell>
                    <TableCell>{row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : "-"}</TableCell>
                    <TableCell>{row.testType}</TableCell>
                    <TableCell><StatusBadge value={row.status} category="testRequest" /></TableCell>
                    <TableCell><StatusBadge value={row.resultStatus} category="result" /></TableCell>
                    <TableCell>{row.collectedAt ? new Date(row.collectedAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>{row.resultReportedAt ? new Date(row.resultReportedAt).toLocaleString() : "-"}</TableCell>
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
