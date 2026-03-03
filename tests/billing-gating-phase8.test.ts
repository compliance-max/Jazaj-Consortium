import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { createEmployerWithDer } from "@/lib/services/employers";
import { assignDriverToEmployerPool, ensureEmployerActivePool } from "@/lib/services/pools";
import { runRandomSelections } from "@/lib/services/random/engine";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock
}));

vi.mock("@/lib/email/postmark", () => ({
  sendVerificationEmail: vi.fn(async () => ({ messageId: "test-msg" })),
  sendSetPasswordEmail: vi.fn(async () => ({ messageId: "test-msg" })),
  sendCertificateIssuedEmail: vi.fn(async () => ({ messageId: "test-msg" })),
  sendResultPostedEmail: vi.fn(async () => ({ messageId: "test-msg" })),
  sendRandomSelectionNotice: vi.fn(async () => ({ messageId: "test-msg" })),
  sendRandomNoSelectionNotice: vi.fn(async () => ({ messageId: "test-msg" })),
  sendQuarterEndRosterReviewEmail: vi.fn(async () => ({ messageId: "test-msg" }))
}));

describe("billing gating for employer activation", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
  });

  test("admin-created employer defaults to PENDING_PAYMENT and is excluded from random runs", async () => {
    const createdPending = await createEmployerWithDer({
      legalName: "Pending Carrier",
      dotNumber: "P1001",
      address: "100 Pending St",
      phone: "3135551001",
      email: "pending@carrier.test",
      derEmail: "pending-der@carrier.test",
      derFullName: "Pending DER",
      poolMode: "INDIVIDUAL"
    });

    expect(createdPending.employer.status).toBe("PENDING_PAYMENT");
    expect(createdPending.employer.activePoolId).toBeTruthy();

    const activeEmployer = await testPrisma.employer.create({
      data: {
        legalName: "Active Carrier",
        dotNumber: "A2002",
        address: "200 Active St",
        phone: "3135552002",
        email: "active@carrier.test",
        status: "ACTIVE",
        poolMode: "INDIVIDUAL"
      }
    });

    const activePool = await testPrisma.$transaction((tx) =>
      ensureEmployerActivePool(tx, {
        id: activeEmployer.id,
        poolMode: activeEmployer.poolMode,
        timezone: activeEmployer.timezone,
        activePoolId: activeEmployer.activePoolId
      })
    );

    const [pendingDriver, activeDriver] = await Promise.all([
      testPrisma.driver.create({
        data: {
          employerId: createdPending.employer.id,
          firstName: "Pat",
          lastName: "Pending",
          dob: new Date("1990-01-01"),
          active: true,
          dotCovered: true
        }
      }),
      testPrisma.driver.create({
        data: {
          employerId: activeEmployer.id,
          firstName: "Alex",
          lastName: "Active",
          dob: new Date("1991-01-01"),
          active: true,
          dotCovered: true
        }
      })
    ]);

    await testPrisma.$transaction(async (tx) => {
      await assignDriverToEmployerPool(tx, {
        driverId: pendingDriver.id,
        employerId: createdPending.employer.id,
        reason: "pending_seed"
      });
      await assignDriverToEmployerPool(tx, {
        driverId: activeDriver.id,
        employerId: activeEmployer.id,
        reason: "active_seed"
      });
    });

    const run = await runRandomSelections({
      commit: true,
      year: 2026,
      quarter: 1
    });

    const poolIds = new Set(run.results.map((row) => row.poolId));
    expect(poolIds.has(activePool.id)).toBe(true);
    expect(poolIds.has(createdPending.employer.activePoolId as string)).toBe(false);

    const pendingEvents = await testPrisma.randomSelectionEvent.count({
      where: {
        poolId: createdPending.employer.activePoolId as string,
        randomPeriod: {
          year: 2026,
          periodNumber: 1
        }
      }
    });
    expect(pendingEvents).toBe(0);
  });

  test("portal write remains blocked when employer is not ACTIVE", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Portal Pending Carrier",
        dotNumber: "P3003",
        address: "300 Portal St",
        phone: "3135553003",
        email: "portal-pending@carrier.test",
        status: "PENDING_PAYMENT",
        poolMode: "INDIVIDUAL"
      }
    });

    await testPrisma.employerUser.create({
      data: {
        email: "portal-der@carrier.test",
        fullName: "Portal DER",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        emailVerifiedAt: new Date(),
        passwordSet: true
      }
    });

    authMock.mockResolvedValue({
      user: {
        id: "der-portal-1",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        emailVerifiedAt: new Date().toISOString()
      }
    });

    const { POST } = await import("@/app/api/portal/drivers/route");
    const response = await POST(
      new Request("http://localhost:3000/api/portal/drivers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          firstName: "Blocked",
          lastName: "Driver",
          dob: "1992-01-01",
          cdlNumber: "BLK1001",
          state: "MI",
          email: "blocked.driver@test.com",
          phone: "3135559090",
          dotCovered: true,
          active: true
        })
      })
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(String(payload.error || "").toLowerCase()).toContain("inactive");
  });

  test("manual activation endpoint makes employer active, creates paid enrollment, certificate, and random eligibility", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "activation-admin@test.com",
        fullName: "Activation Admin",
        role: "CTPA_ADMIN"
      }
    });

    const pendingEmployer = await testPrisma.employer.create({
      data: {
        legalName: "Activation Carrier",
        dotNumber: "P4004",
        address: "400 Activation Ave",
        phone: "3135554004",
        email: "activation@carrier.test",
        status: "PENDING_PAYMENT",
        poolMode: "INDIVIDUAL"
      }
    });

    await testPrisma.$transaction((tx) =>
      ensureEmployerActivePool(tx, {
        id: pendingEmployer.id,
        poolMode: pendingEmployer.poolMode,
        timezone: pendingEmployer.timezone,
        activePoolId: pendingEmployer.activePoolId
      })
    );

    const driver = await testPrisma.driver.create({
      data: {
        employerId: pendingEmployer.id,
        firstName: "Ready",
        lastName: "Driver",
        dob: new Date("1993-01-01"),
        active: true,
        dotCovered: true
      }
    });

    await testPrisma.$transaction((tx) =>
      assignDriverToEmployerPool(tx, {
        driverId: driver.id,
        employerId: pendingEmployer.id,
        changedByUserId: admin.id,
        reason: "activation_seed"
      })
    );

    authMock.mockResolvedValue({
      user: {
        id: admin.id,
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date().toISOString()
      }
    });

    const { POST } = await import("@/app/api/admin/employers/[id]/activate/route");
    const activateRes = await POST(
      new Request("http://localhost:3000/api/admin/employers/activation/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          method: "MANUAL",
          overrideReason: "Manual activation after verified enrollment invoice"
        })
      }),
      { params: { id: pendingEmployer.id } }
    );

    expect(activateRes.status).toBe(200);
    const payload = await activateRes.json();
    expect(payload.employer.status).toBe("ACTIVE");

    const payment = await testPrisma.payment.findFirst({
      where: {
        employerId: pendingEmployer.id,
        type: "ENROLLMENT",
        status: "PAID"
      }
    });
    expect(payment).toBeTruthy();

    const certificate = await testPrisma.enrollmentCertificate.findFirst({
      where: {
        employerId: pendingEmployer.id,
        status: "ACTIVE"
      },
      include: {
        document: true
      }
    });
    expect(certificate).toBeTruthy();
    expect(certificate?.document?.id).toBeTruthy();

    const run = await runRandomSelections({
      commit: true,
      year: 2026,
      quarter: 1,
      employerId: pendingEmployer.id
    });

    expect(run.results).toHaveLength(1);
    expect(run.results[0].eligibleCount).toBeGreaterThan(0);
  });
});
