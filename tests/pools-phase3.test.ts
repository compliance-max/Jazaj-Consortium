import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { assignDriverToEmployerPool, ensureEmployerActivePool } from "@/lib/services/pools";
import { updateEmployer } from "@/lib/services/employers";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock
}));

describe("Phase 3 pools and memberships", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
  });

  test("master pool is shared across employers in MASTER mode", async () => {
    const [employerA, employerB] = await Promise.all([
      testPrisma.employer.create({
        data: {
          legalName: "Master A",
          address: "100 Shared Way",
          phone: "3135550101",
          email: "master-a@example.com",
          poolMode: "MASTER"
        }
      }),
      testPrisma.employer.create({
        data: {
          legalName: "Master B",
          address: "200 Shared Way",
          phone: "3135550102",
          email: "master-b@example.com",
          poolMode: "MASTER"
        }
      })
    ]);

    const [poolA, poolB] = await testPrisma.$transaction(async (tx) => {
      const a = await ensureEmployerActivePool(tx, {
        id: employerA.id,
        poolMode: employerA.poolMode,
        timezone: employerA.timezone,
        activePoolId: employerA.activePoolId
      });
      const b = await ensureEmployerActivePool(tx, {
        id: employerB.id,
        poolMode: employerB.poolMode,
        timezone: employerB.timezone,
        activePoolId: employerB.activePoolId
      });
      return [a, b];
    });

    expect(poolA.id).toBe(poolB.id);
    const masterPools = await testPrisma.pool.findMany({
      where: { type: "MASTER", dotAgency: "FMCSA" }
    });
    expect(masterPools).toHaveLength(1);
  });

  test("individual pools are unique per employer", async () => {
    const [employerA, employerB] = await Promise.all([
      testPrisma.employer.create({
        data: {
          legalName: "Individual A",
          address: "100 Solo Way",
          phone: "3135550111",
          email: "solo-a@example.com",
          poolMode: "INDIVIDUAL"
        }
      }),
      testPrisma.employer.create({
        data: {
          legalName: "Individual B",
          address: "200 Solo Way",
          phone: "3135550112",
          email: "solo-b@example.com",
          poolMode: "INDIVIDUAL"
        }
      })
    ]);

    const [poolA, poolB] = await testPrisma.$transaction(async (tx) => {
      const a = await ensureEmployerActivePool(tx, {
        id: employerA.id,
        poolMode: employerA.poolMode,
        timezone: employerA.timezone,
        activePoolId: employerA.activePoolId
      });
      const b = await ensureEmployerActivePool(tx, {
        id: employerB.id,
        poolMode: employerB.poolMode,
        timezone: employerB.timezone,
        activePoolId: employerB.activePoolId
      });
      return [a, b];
    });

    expect(poolA.id).not.toBe(poolB.id);
    expect(poolA.type).toBe("INDIVIDUAL");
    expect(poolB.type).toBe("INDIVIDUAL");
  });

  test("driver cannot have two active memberships (constraint + service behavior)", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Constraint Carrier",
        address: "100 Constraint Way",
        phone: "3135550120",
        email: "constraint@example.com",
        poolMode: "INDIVIDUAL"
      }
    });
    const driver = await testPrisma.driver.create({
      data: {
        employerId: employer.id,
        firstName: "Casey",
        lastName: "Constraint",
        dob: new Date("1990-01-01"),
        active: true
      }
    });

    const assigned = await testPrisma.$transaction(async (tx) => {
      return assignDriverToEmployerPool(tx, {
        driverId: driver.id,
        employerId: employer.id,
        reason: "initial_assignment"
      });
    });

    await expect(
      testPrisma.driverPoolMembership.create({
        data: {
          driverId: driver.id,
          poolId: assigned.pool.id,
          reason: "invalid_second_active"
        }
      })
    ).rejects.toBeTruthy();

    await testPrisma.$transaction(async (tx) => {
      await assignDriverToEmployerPool(tx, {
        driverId: driver.id,
        employerId: employer.id,
        reason: "service_reassignment"
      });
    });

    const activeMemberships = await testPrisma.driverPoolMembership.findMany({
      where: { driverId: driver.id, effectiveEnd: null }
    });
    expect(activeMemberships).toHaveLength(1);
  });

  test("switching pool mode with migrateDrivers migrates and audits", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "admin-pools@example.com",
        fullName: "Pool Admin",
        role: "CTPA_ADMIN"
      }
    });
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Switch Carrier",
        address: "100 Switch Way",
        phone: "3135550130",
        email: "switch@example.com",
        poolMode: "INDIVIDUAL"
      }
    });
    const [driverA, driverB] = await Promise.all([
      testPrisma.driver.create({
        data: {
          employerId: employer.id,
          firstName: "One",
          lastName: "Driver",
          dob: new Date("1987-01-01"),
          active: true
        }
      }),
      testPrisma.driver.create({
        data: {
          employerId: employer.id,
          firstName: "Two",
          lastName: "Driver",
          dob: new Date("1988-01-01"),
          active: true
        }
      })
    ]);

    await testPrisma.$transaction(async (tx) => {
      await assignDriverToEmployerPool(tx, {
        driverId: driverA.id,
        employerId: employer.id,
        changedByUserId: admin.id,
        reason: "seed_assignment"
      });
      await assignDriverToEmployerPool(tx, {
        driverId: driverB.id,
        employerId: employer.id,
        changedByUserId: admin.id,
        reason: "seed_assignment"
      });
    });

    const updated = await updateEmployer(
      employer.id,
      {
        poolMode: "MASTER",
        migrateDrivers: true
      },
      admin.id
    );

    expect(updated.migrationSummary.movedDrivers).toBe(2);
    expect(updated.migrationSummary.closedMemberships).toBe(2);
    expect(updated.migrationSummary.createdMemberships).toBe(2);
    expect(updated.employer.poolMode).toBe("MASTER");
    expect(updated.employer.activePool?.type).toBe("MASTER");

    const drivers = await testPrisma.driver.findMany({
      where: { employerId: employer.id }
    });
    const masterPoolId = updated.employer.activePool?.id;
    expect(masterPoolId).toBeTruthy();
    for (const driver of drivers) {
      expect(driver.currentPoolId).toBe(masterPoolId);
      const activeMemberships = await testPrisma.driverPoolMembership.findMany({
        where: { driverId: driver.id, effectiveEnd: null }
      });
      expect(activeMemberships).toHaveLength(1);
      expect(activeMemberships[0].reason).toBe("pool_mode_switch");
    }

    const switchAudit = await testPrisma.auditLog.findMany({
      where: { employerId: employer.id, action: "EMPLOYER_POOL_MODE_SWITCH" }
    });
    expect(switchAudit.length).toBeGreaterThan(0);
    const migratedAudit = await testPrisma.auditLog.findMany({
      where: { employerId: employer.id, action: "DRIVER_POOL_MIGRATED" }
    });
    expect(migratedAudit).toHaveLength(2);
  });

  test("portal driver list remains employer-scoped in MASTER pool mode", async () => {
    const [employerA, employerB] = await Promise.all([
      testPrisma.employer.create({
        data: {
          legalName: "Scoped A",
          address: "100 Scope Way",
          phone: "3135550140",
          email: "scope-a@example.com",
          poolMode: "MASTER"
        }
      }),
      testPrisma.employer.create({
        data: {
          legalName: "Scoped B",
          address: "200 Scope Way",
          phone: "3135550150",
          email: "scope-b@example.com",
          poolMode: "MASTER"
        }
      })
    ]);

    const [driverA, driverB] = await Promise.all([
      testPrisma.driver.create({
        data: {
          employerId: employerA.id,
          firstName: "Alice",
          lastName: "Scoped",
          dob: new Date("1981-01-01"),
          active: true
        }
      }),
      testPrisma.driver.create({
        data: {
          employerId: employerB.id,
          firstName: "Bob",
          lastName: "Scoped",
          dob: new Date("1982-01-01"),
          active: true
        }
      })
    ]);

    await testPrisma.$transaction(async (tx) => {
      await assignDriverToEmployerPool(tx, {
        driverId: driverA.id,
        employerId: employerA.id,
        reason: "seed_master_a"
      });
      await assignDriverToEmployerPool(tx, {
        driverId: driverB.id,
        employerId: employerB.id,
        reason: "seed_master_b"
      });
    });

    authMock.mockResolvedValue({
      user: {
        id: "der-scope-a",
        role: "EMPLOYER_DER",
        employerId: employerA.id,
        emailVerifiedAt: new Date().toISOString()
      }
    });

    const { GET } = await import("@/app/api/portal/drivers/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    const ids = payload.drivers.map((driver: { id: string }) => driver.id);
    expect(ids).toContain(driverA.id);
    expect(ids).not.toContain(driverB.id);
  });
});
