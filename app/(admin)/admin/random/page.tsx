"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ComplianceRow = {
  id: string;
  employerId: string | null;
  poolId: string;
  year: number;
  avgCoveredDrivers: number;
  requiredDrug: number;
  completedDrug: number;
  requiredAlcohol: number;
  completedAlcohol: number;
};

export default function AdminRandomPage() {
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/random/compliance?year=${year}`);
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Failed to load compliance summaries");
      return;
    }
    setRows(payload.items || []);
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title="Random Program" subtitle="Compliance summaries by pool/employer for the selected year." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Random compliance load failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Year Filter</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || new Date().getUTCFullYear()))} className="max-w-[180px]" />
          <Button onClick={() => void load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead>Avg Covered</TableHead>
                <TableHead>Drug Required</TableHead>
                <TableHead>Drug Completed</TableHead>
                <TableHead>Alcohol Required</TableHead>
                <TableHead>Alcohol Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.employerId || "MASTER"}</TableCell>
                  <TableCell>{row.poolId}</TableCell>
                  <TableCell>{row.avgCoveredDrivers.toFixed(2)}</TableCell>
                  <TableCell>{row.requiredDrug}</TableCell>
                  <TableCell>{row.completedDrug}</TableCell>
                  <TableCell>{row.requiredAlcohol}</TableCell>
                  <TableCell>{row.completedAlcohol}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
