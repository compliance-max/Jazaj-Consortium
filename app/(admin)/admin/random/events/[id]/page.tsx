"use client";

import { useEffect, useState } from "react";

type RandomEventAudit = {
  id: string;
  runAt: string;
  eligibleCount: number;
  selectedCountDrug: number;
  selectedCountAlcohol: number;
  eligibleHash: string;
  selectedHashDrug: string;
  selectedHashAlcohol: string;
  randomHmac: string;
  algorithmVersion: string;
  selectionLocked: boolean;
  pool: { id: string; type: "MASTER" | "INDIVIDUAL"; dotAgency: "FMCSA" };
  randomPeriod: { year: number; periodNumber: number; startDate: string; endDate: string };
  selectedDrivers: Array<{
    id: string;
    employerId: string;
    testType: "DRUG" | "ALCOHOL" | "BOTH";
    status: "SELECTED" | "NOTIFIED" | "SCHEDULED" | "COMPLETED" | "CANCELLED" | "REPLACED";
    driver: { id: string; firstName: string; lastName: string };
  }>;
};

export default function RandomEventAuditPage({ params }: { params: { id: string } }) {
  const [event, setEvent] = useState<RandomEventAudit | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/random/events/${params.id}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || "Failed to load random event");
        return;
      }
      setEvent(payload.event);
    }
    void load();
  }, [params.id]);

  return (
    <main>
      <div className="card">
        <h1>Random Event Audit</h1>
        {error ? <p className="error">{error}</p> : null}
      </div>
      {!event ? <div className="card"><p>Loading...</p></div> : null}
      {event ? (
        <>
          <div className="card">
            <p>Event ID: {event.id}</p>
            <p>Pool: {event.pool.type} ({event.pool.id})</p>
            <p>Quarter: Q{event.randomPeriod.periodNumber} {event.randomPeriod.year}</p>
            <p>Eligible count: {event.eligibleCount}</p>
            <p>Selected drug: {event.selectedCountDrug}</p>
            <p>Selected alcohol: {event.selectedCountAlcohol}</p>
            <p>Algorithm: {event.algorithmVersion}</p>
            <p>Locked: {event.selectionLocked ? "Yes" : "No"}</p>
            <p>Proof: {event.randomHmac}</p>
            <p>Eligible hash: {event.eligibleHash}</p>
            <p>Drug hash: {event.selectedHashDrug}</p>
            <p>Alcohol hash: {event.selectedHashAlcohol}</p>
          </div>
          <div className="card">
            <h2>Selected Drivers</h2>
            {event.selectedDrivers.map((row) => (
              <p key={row.id}>
                {row.driver.firstName} {row.driver.lastName} | {row.testType} | {row.status}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
