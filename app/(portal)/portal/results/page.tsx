"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ResultRow = {
  id: string;
  testType: "DRUG" | "ALCOHOL" | "BOTH";
  resultStatus: "NEGATIVE" | "POSITIVE" | "REFUSAL" | "CANCELLED" | "PENDING";
  resultDate: string | null;
  collectedAt: string | null;
  notes: string | null;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

type DocumentRow = {
  id: string;
  filename: string;
  downloadUrl: string;
};

export default function PortalResultsPage() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [documentsByRequest, setDocumentsByRequest] = useState<Record<string, DocumentRow[]>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/portal/results");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || "Failed to load results");
        return;
      }
      setRows(payload.results || []);
    }
    void load();
  }, []);

  async function loadDocuments(requestId: string) {
    const res = await fetch(`/api/portal/test-requests/${requestId}/documents`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load documents");
      return;
    }
    setDocumentsByRequest((prev) => ({
      ...prev,
      [requestId]: payload.documents || []
    }));
  }

  async function openDocument(url: string) {
    const res = await fetch(url);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to get document URL");
      return;
    }
    if (payload.url) {
      window.open(payload.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Results" subtitle="Track finalized outcomes and access attached test documentation." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Results error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Result Records</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="No finalized results yet" description="Results will appear here once requests are processed and reported." />
          ) : (
            <Table compact>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Collection Date</TableHead>
                  <TableHead>Result Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : row.id}</TableCell>
                    <TableCell>{row.testType}</TableCell>
                    <TableCell><StatusBadge value={row.resultStatus} category="result" /></TableCell>
                    <TableCell>{row.collectedAt ? row.collectedAt.slice(0, 10) : "-"}</TableCell>
                    <TableCell>{row.resultDate ? row.resultDate.slice(0, 10) : "-"}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{row.notes || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void loadDocuments(row.id)}>
                          Load Docs
                        </Button>
                        {(documentsByRequest[row.id] || []).map((doc) => (
                          <Button key={doc.id} size="sm" variant="outline" onClick={() => void openDocument(doc.downloadUrl)}>
                            {doc.filename}
                          </Button>
                        ))}
                      </div>
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
