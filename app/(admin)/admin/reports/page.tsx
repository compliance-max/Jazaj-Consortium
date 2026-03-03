"use client";

import { FormEvent, useEffect, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ExportHistoryRow = {
  id: string;
  createdAt: string;
  employerId: string | null;
  storageKey: string;
  filename: string;
  downloadUrl: string | null;
};

export default function AdminReportsPage() {
  const [employerId, setEmployerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ExportHistoryRow[]>([]);

  async function loadHistory() {
    const res = await fetch("/api/admin/reports/history");
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setHistory(payload.items || []);
  }

  async function runExport(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");
    setDownloadUrl("");

    const toIsoRange = (value: string, endOfDay: boolean) => {
      if (!value) return null;
      return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
    };

    const res = await fetch("/api/admin/reports/export", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        employerId: employerId || null,
        dateFrom: toIsoRange(dateFrom, false),
        dateTo: toIsoRange(dateTo, true)
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Export failed");
      toast.error("Audit export failed", { description: payload.error || "Try again with a narrower range." });
      return;
    }

    const msg = `Export ready (${payload.totals?.testRequests || 0} test requests, ${payload.totals?.randomEvents || 0} random events).`;
    setStatus(msg);
    setDownloadUrl(payload.downloadUrl || "");
    toast.success("Audit export generated", { description: msg });
    await loadHistory();
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Generate FMCSA audit export packages and track recent exports." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Export error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Audit Export</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={runExport}>
            <Input placeholder="Employer ID (optional)" value={employerId} onChange={(e) => setEmployerId(e.target.value)} />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Button type="submit" disabled={loading}>
              {loading ? "Generating..." : "Generate Export"}
            </Button>
          </form>
          {status ? <p className="mt-3 text-sm text-success">{status}</p> : null}
          {downloadUrl ? (
            <div className="mt-4">
              <Button asChild>
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  Download Latest Package
                </a>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState title="No exports yet" description="Run your first report to populate export history." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Storage Key</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.filename}</TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{row.employerId || "ALL"}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{row.storageKey}</TableCell>
                    <TableCell>
                      {row.downloadUrl ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={row.downloadUrl} target="_blank" rel="noreferrer">
                            Download
                          </a>
                        </Button>
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
    </div>
  );
}
