import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { ensureEmployerActivePool, assignDriverToEmployerPool } from "@/lib/services/pools";
import { runRandomSelections } from "@/lib/services/random/engine";
import { buildRandomHmac, sortedIdsHash } from "@/lib/services/random/proof";
import { replaceSelectedDriver } from "@/lib/services/random/events";
import { markRandomTestRequestCollected } from "@/lib/services/random/compliance";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock
}));

async function createEmployerWithPool(input: {
  legalName: string;
  email: string;
  poolMode: "MASTER" | "INDIVIDUAL";
  derEmail: string;
}) {
  const employer = await testPrisma.employer.create({
    data: {
      legalName: input.legalName,
      address: "100 Test Way",
      phone: "3135550100",
      email: input.email,
      poolMode: input.poolMode,
      status: "ACTIVE"
    }
  });

  await testPrisma.employerUser.create({
    data: {
      email: input.derEmail,
      fullName: `${input.legalName} DER`,
      role: "EMPLOYER_DER",
      employerId: employer.id,
      emailVerifiedAt: new Date()
    }
  });

  const pool = await testPrisma.$transaction((tx) =>
    ensureEmployerActivePool(tx, {
      id: employer.id,
      poolMode: employer.poolMode,
      timezone: employer.timezone,
      activePoolId: employer.activePoolId
    })
  );

  return { employer, pool };
}

async function addDriverToPool(input: {
  employerId: string;
  firstName: string;
  lastName: string;
  changedByUserId?: string;
}) {
  const driver = await testPrisma.driver.create({
    data: {
      employerId: input.employerId,
      firstName: input.firstName,
      lastName: input.lastName,
      dob: new Date("1990-01-01"),
      active: true,
      dotCovered: true
    }
  });

  await testPrisma.$transaction((tx) =>
    assignDriverToEmployerPool(tx, {
      driverId: driver.id,
      employerId: input.employerId,
      changedByUserId: input.changedByUserId,
      reason: "test_seed"
    })
  );

  return driver;
}

describe("Phase 4 random engine", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
  });

  test("MASTER pool creates one event per pool/period and portal shows only employer data", async () => {
    const { employer: employerA, pool } = await createEmployerWithPool({
      legalName: "Master A",
      email: "master-a@example.com",
      poolMode: "MASTER",
      derEmail: "der-a@example.com"
    });
    const { employer: employerB } = await createEmployerWithPool({
      legalName: "Master B",
      email: "master-b@example.com",
      poolMode: "MASTER",
      derEmail: "der-b@example.com"
    });

    await Promise.all([
      addDriverToPool({ employerId: employerA.id, firstName: "A1", lastName: "Driver" }),
      addDriverToPool({ employerId: employerA.id, firstName: "A2", lastName: "Driver" }),
      addDriverToPool({ employerId: employerB.id, firstName: "B1", lastName: "Driver" }),
      addDriverToPool({ employerId: employerB.id, firstName: "B2", lastName: "Driver" })
    ]);

    await testPrisma.dotRateConfig.create({
      data: {
        agency: "FMCSA",
        year: 2026,
        drugRate: 1,
        alcoholRate: 0
      }
    });

    const run = await runRandomSelections({
      commit: true,
      year: 2026,
      quarter: 1
    });
    expect(run.results).toHaveLength(1);
    expect(run.results[0].poolId).toBe(pool.id);

    const events = await testPrisma.randomSelectionEvent.findMany({
      where: { poolId: pool.id }
    });
    expect(events).toHaveLength(1);

    const event = await testPrisma.randomSelectionEvent.findFirstOrThrow({
      where: { poolId: pool.id },
      include: { eligibleDrivers: true }
    });
    const recomputedEligibleHash = sortedIdsHash(event.eligibleDrivers.map((row) => row.driverId));
    expect(event.eligibleHash).toBe(recomputedEligibleHash);

    authMock.mockResolvedValue({
      user: {
        id: "der-a",
        role: "EMPLOYER_DER",
        employerId: employerA.id,
        emailVerifiedAt: new Date().toISOString()
      }
    });
    const { GET } = await import("@/app/api/portal/random/route");
    const response = await GET(new Request("http://localhost/api/portal/random?year=2026"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    for (const row of payload.events as Array<{ selectedDrivers: Array<{ employerId: string }> }>) {
      for (const selected of row.selectedDrivers) {
        expect(selected.employerId).toBe(employerA.id);
      }
    }
  });

  test("INDIVIDUAL pools create separate events per employer pool", async () => {
    const { employer: employerA, pool: poolA } = await createEmployerWithPool({
      legalName: "Individual A",
      email: "ind-a@example.com",
      poolMode: "INDIVIDUAL",
      derEmail: "ind-der-a@example.com"
    });
    const { employer: employerB, pool: poolB } = await createEmployerWithPool({
      legalName: "Individual B",
      email: "ind-b@example.com",
      poolMode: "INDIVIDUAL",
      derEmail: "ind-der-b@example.com"
    });

    await Promise.all([
      addDriverToPool({ employerId: employerA.id, firstName: "IA1", lastName: "Driver" }),
      addDriverToPool({ employerId: employerA.id, firstName: "IA2", lastName: "Driver" }),
      addDriverToPool({ employerId: employerB.id, firstName: "IB1", lastName: "Driver" }),
      addDriverToPool({ employerId: employerB.id, firstName: "IB2", lastName: "Driver" })
    ]);

    const run = await runRandomSelections({
      commit: true,
      year: 2026,
      quarter: 2
    });
    expect(run.results).toHaveLength(2);

    const events = await testPrisma.randomSelectionEvent.findMany({
      where: {
        randomPeriod: { year: 2026, periodNumber: 2 }
      }
    });
    expect(events).toHaveLength(2);
    const poolIds = new Set(events.map((row) => row.poolId));
    expect(poolIds.has(poolA.id)).toBe(true);
    expect(poolIds.has(poolB.id)).toBe(true);
  });

  test("proof hashes are sorted and HMAC changes with selected hash", () => {
    expect(sortedIdsHash(["b", "a", "c"])).toBe(sortedIdsHash(["c", "b", "a"]));

    const hmac1 = buildRandomHmac({
      poolId: "pool-1",
      randomPeriodId: "period-1",
      runAtIso: "2026-01-01T09:00:00.000Z",
      eligibleHash: "eligible",
      selectedHashDrug: "drug-a",
      selectedHashAlcohol: "alcohol-a",
      algorithmVersion: "v1"
    });
    const hmac2 = buildRandomHmac({
      poolId: "pool-1",
      randomPeriodId: "period-1",
      runAtIso: "2026-01-01T09:00:00.000Z",
      eligibleHash: "eligible",
      selectedHashDrug: "drug-b",
      selectedHashAlcohol: "alcohol-a",
      algorithmVersion: "v1"
    });
    expect(hmac1).not.toBe(hmac2);
  });

  test("selection locking: replacement blocked unless admin with overrideReason", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "admin@example.com",
        fullName: "Admin",
        role: "CTPA_ADMIN"
      }
    });
    const manager = await testPrisma.employerUser.create({
      data: {
        email: "manager@example.com",
        fullName: "Manager",
        role: "CTPA_MANAGER"
      }
    });

    const { employer } = await createEmployerWithPool({
      legalName: "Replace Carrier",
      email: "replace@example.com",
      poolMode: "INDIVIDUAL",
      derEmail: "replace-der@example.com"
    });
    const [d1, d2, d3] = await Promise.all([
      addDriverToPool({ employerId: employer.id, firstName: "R1", lastName: "Driver" }),
      addDriverToPool({ employerId: employer.id, firstName: "R2", lastName: "Driver" }),
      addDriverToPool({ employerId: employer.id, firstName: "R3", lastName: "Driver" })
    ]);

    await testPrisma.dotRateConfig.create({
      data: {
        agency: "FMCSA",
        year: 2026,
        drugRate: 1,
        alcoholRate: 0
      }
    });

    await runRandomSelections({ commit: true, year: 2026, quarter: 1 });
    const event = await testPrisma.randomSelectionEvent.findFirstOrThrow({
      where: { employerId: employer.id },
      include: { selectedDrivers: true }
    });
    expect(event.selectionLocked).toBe(true);
    const original = event.selectedDrivers[0];
    const replacementDriverId = [d1.id, d2.id, d3.id].find((id) => !event.selectedDrivers.some((row) => row.driverId === id));
    expect(replacementDriverId).toBeTruthy();

    await expect(
      replaceSelectedDriver({
        selectedDriverId: original.id,
        replacementDriverId: replacementDriverId as string,
        overrideReason: "Manager attempt to replace",
        actorUserId: manager.id,
        actorRole: manager.role
      })
    ).rejects.toThrow("LOCKED_SELECTION_ADMIN_ONLY");

    await expect(
      replaceSelectedDriver({
        selectedDriverId: original.id,
        replacementDriverId: replacementDriverId as string,
        overrideReason: "short",
        actorUserId: admin.id,
        actorRole: admin.role
      })
    ).rejects.toThrow("OVERRIDE_REASON_REQUIRED");

    const replacement = await replaceSelectedDriver({
      selectedDriverId: original.id,
      replacementDriverId: replacementDriverId as string,
      overrideReason: "Long-term absence documented by admin override",
      actorUserId: admin.id,
      actorRole: admin.role
    });
    expect(replacement.id).toBeTruthy();

    const audit = await testPrisma.auditLog.findFirst({
      where: {
        action: "SELECT_ALTERNATE",
        entityId: replacement.id
      }
    });
    expect(audit?.metadata).toBeTruthy();
  });

  test("compliance completed counts update when collectedAt is set", async () => {
    const { employer, pool } = await createEmployerWithPool({
      legalName: "Compliance Carrier",
      email: "compliance@example.com",
      poolMode: "INDIVIDUAL",
      derEmail: "compliance-der@example.com"
    });

    await Promise.all([
      addDriverToPool({ employerId: employer.id, firstName: "C1", lastName: "Driver" }),
      addDriverToPool({ employerId: employer.id, firstName: "C2", lastName: "Driver" })
    ]);

    await testPrisma.dotRateConfig.create({
      data: {
        agency: "FMCSA",
        year: 2026,
        drugRate: 1,
        alcoholRate: 0
      }
    });

    await runRandomSelections({ commit: true, year: 2026, quarter: 1 });
    const selected = await testPrisma.randomSelectedDriver.findFirstOrThrow({
      where: {
        selectionEvent: {
          poolId: pool.id
        },
        testRequestId: { not: null }
      }
    });

    await markRandomTestRequestCollected({
      testRequestId: selected.testRequestId as string,
      collectedAt: new Date("2026-02-15T12:00:00.000Z")
    });

    const summary = await testPrisma.complianceYearSummary.findFirst({
      where: {
        poolId: pool.id,
        year: 2026,
        employerId: employer.id
      }
    });
    expect(summary).toBeTruthy();
    expect((summary?.completedDrug || 0) >= 1).toBe(true);
  });

  test("idempotency: commit twice does not duplicate event or test requests", async () => {
    const { employer, pool } = await createEmployerWithPool({
      legalName: "Idempotent Carrier",
      email: "idem@example.com",
      poolMode: "INDIVIDUAL",
      derEmail: "idem-der@example.com"
    });
    await Promise.all([
      addDriverToPool({ employerId: employer.id, firstName: "I1", lastName: "Driver" }),
      addDriverToPool({ employerId: employer.id, firstName: "I2", lastName: "Driver" })
    ]);

    const first = await runRandomSelections({
      commit: true,
      year: 2026,
      quarter: 4
    });
    const second = await runRandomSelections({
      commit: true,
      year: 2026,
      quarter: 4
    });

    expect(first.results).toHaveLength(1);
    expect(second.results).toHaveLength(1);
    expect(second.results[0].created).toBe(false);
    expect(second.results[0].eventId).toBe(first.results[0].eventId);

    const eventCount = await testPrisma.randomSelectionEvent.count({
      where: {
        poolId: pool.id,
        randomPeriod: {
          year: 2026,
          periodNumber: 4
        }
      }
    });
    expect(eventCount).toBe(1);

    const requestCount = await testPrisma.testRequest.count({
      where: {
        employerId: employer.id,
        reason: "RANDOM"
      }
    });
    expect(requestCount).toBe(first.results[0].selectedDrivers.length);
  });
});
