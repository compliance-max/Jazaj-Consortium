import path from "path";
import { promises as fs } from "fs";
import JSZip from "jszip";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearDatabase, testPrisma } from "./helpers/db";
import { processCheckoutSessionCompleted } from "@/lib/services/payments";
import { generateAuditExport } from "@/lib/services/reports";
import { middleware } from "@/middleware";
import { buildRandomHmac } from "@/lib/services/random/proof";
import { createCheckoutConfirmToken } from "@/lib/services/checkout-confirm-token";

const {
  authMock,
  getTokenMock,
  stripeRetrieveMock,
  sendEmailMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getTokenMock: vi.fn(),
  stripeRetrieveMock: vi.fn(),
  sendEmailMock: vi.fn(async () => ({ messageId: "mock-email-id" }))
}));

vi.mock("@/auth", () => ({
  auth: authMock
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        retrieve: stripeRetrieveMock
      }
    },
    webhooks: {
      constructEvent: vi.fn()
    }
  })
}));

vi.mock("@/lib/email/postmark", () => ({
  sendVerificationEmail: sendEmailMock,
  sendSetPasswordEmail: sendEmailMock,
  sendEnrollmentCompleteEmail: sendEmailMock,
  sendCertificateIssuedEmail: sendEmailMock,
  sendTestPaymentReceiptEmail: sendEmailMock,
  sendClinicAssignmentEmail: sendEmailMock,
  sendResultPostedEmail: sendEmailMock,
  sendRenewalReceiptEmail: sendEmailMock,
  sendRandomSelectionNotice: sendEmailMock,
  sendRandomNoSelectionNotice: sendEmailMock,
  sendQuarterEndRosterReviewEmail: sendEmailMock,
  sendEmail: sendEmailMock
}));

function fakeCompletedSession(input: {
  id: string;
  kind: "ENROLLMENT" | "RENEWAL" | "TEST_REQUEST";
  metadata?: Record<string, string>;
  amountTotal?: number;
}) {
  return {
    id: input.id,
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    amount_total: input.amountTotal || 0,
    payment_intent: `${input.id}_pi`,
    metadata: {
      kind: input.kind,
      ...(input.metadata || {})
    }
  } as any;
}

describe("Phase 7 regression suite", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
    getTokenMock.mockReset();
    stripeRetrieveMock.mockReset();
    sendEmailMock.mockClear();
    process.env.APP_URL = "http://localhost:3000";
  });

  test("enrollment -> webhook -> certificate -> portal download works", async () => {
    const submission = await testPrisma.enrollmentSubmission.create({
      data: {
        payload: {
          legalName: "Regression Carrier",
          dotNumber: "USDOTREG1",
          address: "500 Regression Rd",
          phone: "3135557000",
          contactName: "Regression DER",
          contactEmail: "reg-der@example.com",
          drivers: []
        },
        status: "PENDING"
      }
    });

    await processCheckoutSessionCompleted(
      fakeCompletedSession({
        id: "cs_regress_enroll",
        kind: "ENROLLMENT",
        metadata: { submissionId: submission.id },
        amountTotal: 9900
      })
    );

    const derUser = await testPrisma.employerUser.findFirstOrThrow({
      where: { email: "reg-der@example.com" }
    });
    const certificate = await testPrisma.enrollmentCertificate.findFirstOrThrow({
      where: { employerId: derUser.employerId! },
      include: { document: true }
    });

    authMock.mockResolvedValue({
      user: {
        id: derUser.id,
        role: "EMPLOYER_DER",
        employerId: derUser.employerId,
        emailVerifiedAt: new Date().toISOString()
      }
    });
    const { GET } = await import("@/app/api/documents/[id]/download/route");
    const response = await GET(new Request(`http://localhost/api/documents/${certificate.document.id}/download`), {
      params: { id: certificate.document.id }
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.url).toBeTruthy();
  });

  test("admin export still works and excludes DOB from drivers.csv", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "admin-regression@example.com",
        fullName: "Admin Regression",
        role: "CTPA_ADMIN",
        passwordSet: true
      }
    });
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Export Regression",
        address: "600 Export Rd",
        phone: "3135557001",
        email: "export-reg@example.com",
        status: "ACTIVE"
      }
    });
    await testPrisma.driver.create({
      data: {
        employerId: employer.id,
        firstName: "NoDob",
        lastName: "Driver",
        dob: new Date("1992-02-02"),
        cdlNumber: "CDL777",
        state: "MI",
        active: true,
        dotCovered: true
      }
    });

    const result = await generateAuditExport({
      actorUserId: admin.id,
      employerId: employer.id
    });
    const key = new URL(result.downloadUrl).searchParams.get("key");
    expect(key).toBeTruthy();

    const zipPath = path.join(process.cwd(), ".local-storage", key!);
    const zipBuffer = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const driversCsv = await zip.file("drivers.csv")?.async("string");
    expect(driversCsv).toBeTruthy();
    const header = driversCsv!.split("\n")[0].toLowerCase();
    expect(header).not.toContain("dob");
  });

  test("CSRF and origin are enforced for representative mutation routes", async () => {
    getTokenMock.mockResolvedValue({
      sub: "admin-token",
      role: "CTPA_ADMIN"
    });

    const invalidOrigin = new NextRequest("http://localhost:3000/api/admin/reports/export", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        cookie: "ctpa_csrf=a",
        "x-csrf-token": "a"
      }
    });
    const invalidOriginRes = await middleware(invalidOrigin);
    expect(invalidOriginRes.status).toBe(403);

    const missingCsrf = new NextRequest("http://localhost:3000/api/chat/message", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000"
      }
    });
    const missingCsrfRes = await middleware(missingCsrf);
    expect(missingCsrfRes.status).toBe(403);

    const valid = new NextRequest("http://localhost:3000/api/chat/message", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "ctpa_csrf=chatok",
        "x-csrf-token": "chatok"
      }
    });
    const validRes = await middleware(valid);
    expect(validRes.status).toBe(200);
  });

  test("random HMAC proof is stable for same inputs", () => {
    const a = buildRandomHmac({
      poolId: "poolA",
      randomPeriodId: "periodA",
      runAtIso: "2026-01-01T09:00:00.000Z",
      eligibleHash: "eligibleHashA",
      selectedHashDrug: "selectedDrugA",
      selectedHashAlcohol: "selectedAlcoholA",
      algorithmVersion: "v1"
    });
    const b = buildRandomHmac({
      poolId: "poolA",
      randomPeriodId: "periodA",
      runAtIso: "2026-01-01T09:00:00.000Z",
      eligibleHash: "eligibleHashA",
      selectedHashDrug: "selectedDrugA",
      selectedHashAlcohol: "selectedAlcoholA",
      algorithmVersion: "v1"
    });
    expect(a).toBe(b);
  });

  test("confirm-session remains read-only (no payment/employer/certificate mutation)", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Confirm ReadOnly",
        address: "700 Confirm St",
        phone: "3135557002",
        email: "confirm-readonly@example.com",
        status: "INACTIVE"
      }
    });
    const document = await testPrisma.document.create({
      data: {
        employerId: employer.id,
        entityType: "CERTIFICATE",
        entityId: "CERT-READ-1",
        storageKey: "certs/CERT-READ-1.pdf",
        filename: "CERT-READ-1.pdf",
        contentType: "application/pdf",
        retentionCategory: "CERTIFICATE"
      }
    });
    await testPrisma.enrollmentCertificate.create({
      data: {
        id: "CERT-READ-1",
        employerId: employer.id,
        effectiveDate: new Date("2026-01-01"),
        expirationDate: new Date("2027-01-01"),
        status: "ACTIVE",
        documentId: document.id
      }
    });
    const request = await testPrisma.testRequest.create({
      data: {
        employerId: employer.id,
        reason: "USER_REQUEST",
        testType: "DRUG",
        status: "PENDING_PAYMENT",
        paid: false,
        priceCents: 7500
      }
    });
    await testPrisma.payment.create({
      data: {
        employerId: employer.id,
        testRequestId: request.id,
        type: "TEST_REQUEST",
        amountCents: 7500,
        status: "PENDING",
        stripeSessionId: "cs_regression_confirm"
      }
    });
    const token = await createCheckoutConfirmToken({
      stripeSessionId: "cs_regression_confirm"
    });

    stripeRetrieveMock.mockResolvedValue({
      id: "cs_regression_confirm",
      status: "complete",
      payment_status: "paid",
      metadata: { kind: "TEST_REQUEST" }
    });
    authMock.mockResolvedValue(null);

    const beforePayment = await testPrisma.payment.findUnique({
      where: { stripeSessionId: "cs_regression_confirm" }
    });
    const beforeEmployer = await testPrisma.employer.findUnique({
      where: { id: employer.id }
    });
    const beforeCertificates = await testPrisma.enrollmentCertificate.count({
      where: { employerId: employer.id }
    });

    const { POST } = await import("@/app/api/stripe/confirm-session/route");
    const response = await POST(
      new Request("http://localhost/api/stripe/confirm-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "cs_regression_confirm",
          confirmToken: token.raw
        })
      })
    );
    expect(response.status).toBe(200);

    const afterPayment = await testPrisma.payment.findUnique({
      where: { stripeSessionId: "cs_regression_confirm" }
    });
    const afterEmployer = await testPrisma.employer.findUnique({
      where: { id: employer.id }
    });
    const afterCertificates = await testPrisma.enrollmentCertificate.count({
      where: { employerId: employer.id }
    });

    expect(beforePayment?.status).toBe("PENDING");
    expect(afterPayment?.status).toBe("PENDING");
    expect(beforeEmployer?.status).toBe("INACTIVE");
    expect(afterEmployer?.status).toBe("INACTIVE");
    expect(afterCertificates).toBe(beforeCertificates);
  });

  test("production cookies include secure flags (csrf cookie)", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      getTokenMock.mockResolvedValue({
        sub: "der-secure",
        role: "EMPLOYER_DER",
        employerId: "emp-secure",
        emailVerifiedAt: new Date().toISOString()
      });
      const middlewareRes = await middleware(
        new NextRequest("http://localhost:3000/portal/dashboard", {
          method: "GET"
        })
      );
      const csrfCookie = middlewareRes.headers.get("set-cookie") || "";
      expect(csrfCookie).toContain("ctpa_csrf=");
      expect(csrfCookie).toContain("Secure");
      expect(csrfCookie.toLowerCase()).toContain("samesite=lax");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
