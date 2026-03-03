import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { createCheckoutConfirmToken } from "@/lib/services/checkout-confirm-token";
import { processCheckoutSessionCompleted } from "@/lib/services/payments";
import { voidEnrollmentCertificate } from "@/lib/services/certificates";

const {
  authMock,
  stripeRetrieveMock,
  sendVerificationEmailMock,
  sendSetPasswordEmailMock,
  sendEnrollmentCompleteEmailMock,
  sendTestPaymentReceiptEmailMock,
  sendClinicAssignmentEmailMock,
  sendRenewalReceiptEmailMock,
  sendResultPostedEmailMock,
  sendCertificateIssuedEmailMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  stripeRetrieveMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(async () => ({ messageId: "verify-msg" })),
  sendSetPasswordEmailMock: vi.fn(async () => ({ messageId: "set-password-msg" })),
  sendEnrollmentCompleteEmailMock: vi.fn(async () => ({ messageId: "enroll-msg" })),
  sendTestPaymentReceiptEmailMock: vi.fn(async () => ({ messageId: "test-pay-msg" })),
  sendClinicAssignmentEmailMock: vi.fn(async () => ({ messageId: "clinic-msg" })),
  sendRenewalReceiptEmailMock: vi.fn(async () => ({ messageId: "renew-msg" })),
  sendResultPostedEmailMock: vi.fn(async () => ({ messageId: "result-msg" })),
  sendCertificateIssuedEmailMock: vi.fn(async () => ({ messageId: "certificate-msg" }))
}));

vi.mock("@/auth", () => ({
  auth: authMock
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
  sendVerificationEmail: sendVerificationEmailMock,
  sendSetPasswordEmail: sendSetPasswordEmailMock,
  sendEnrollmentCompleteEmail: sendEnrollmentCompleteEmailMock,
  sendTestPaymentReceiptEmail: sendTestPaymentReceiptEmailMock,
  sendClinicAssignmentEmail: sendClinicAssignmentEmailMock,
  sendRenewalReceiptEmail: sendRenewalReceiptEmailMock,
  sendResultPostedEmail: sendResultPostedEmailMock,
  sendCertificateIssuedEmail: sendCertificateIssuedEmailMock,
  sendRandomSelectionNotice: vi.fn(async () => ({ messageId: "random-selected" })),
  sendRandomNoSelectionNotice: vi.fn(async () => ({ messageId: "random-none" })),
  sendQuarterEndRosterReviewEmail: vi.fn(async () => ({ messageId: "quarter-end" }))
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

describe("Phase 5 billing/results/certificate flows", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
    stripeRetrieveMock.mockReset();
    sendVerificationEmailMock.mockClear();
    sendSetPasswordEmailMock.mockClear();
    sendEnrollmentCompleteEmailMock.mockClear();
    sendTestPaymentReceiptEmailMock.mockClear();
    sendClinicAssignmentEmailMock.mockClear();
    sendRenewalReceiptEmailMock.mockClear();
    sendResultPostedEmailMock.mockClear();
    sendCertificateIssuedEmailMock.mockClear();
  });

  test("enrollment webhook creates employer + DER tokens + payment + certificate + document and sends emails", async () => {
    const submission = await testPrisma.enrollmentSubmission.create({
      data: {
        payload: {
          legalName: "Enrollment Carrier",
          dotNumber: "USDOT1234",
          address: "100 Main St",
          phone: "3135550100",
          contactName: "DER Contact",
          contactEmail: "der-enroll@example.com",
          drivers: [
            {
              firstName: "John",
              lastName: "Driver",
              dob: "1990-01-01",
              cdlNumber: "CDL001",
              state: "MI"
            }
          ]
        },
        status: "PENDING"
      }
    });

    await processCheckoutSessionCompleted(
      fakeCompletedSession({
        id: "cs_enroll_1",
        kind: "ENROLLMENT",
        metadata: { submissionId: submission.id },
        amountTotal: 9900
      })
    );

    const employer = await testPrisma.employer.findFirst({
      where: { email: "der-enroll@example.com" }
    });
    expect(employer).toBeTruthy();
    expect(employer?.status).toBe("ACTIVE");

    const user = await testPrisma.employerUser.findFirst({
      where: { email: "der-enroll@example.com", employerId: employer?.id }
    });
    expect(user).toBeTruthy();

    const tokens = await testPrisma.accountToken.findMany({
      where: { userId: user?.id }
    });
    const tokenTypes = new Set(tokens.map((row) => row.type));
    expect(tokenTypes.has("EMAIL_VERIFICATION")).toBe(true);
    expect(tokenTypes.has("SET_PASSWORD")).toBe(true);

    const payment = await testPrisma.payment.findUnique({
      where: { stripeSessionId: "cs_enroll_1" }
    });
    expect(payment?.status).toBe("PAID");
    expect(payment?.type).toBe("ENROLLMENT");

    const cert = await testPrisma.enrollmentCertificate.findFirst({
      where: { employerId: employer?.id }
    });
    expect(cert).toBeTruthy();
    const doc = await testPrisma.document.findUnique({
      where: { id: cert?.documentId || "" }
    });
    expect(doc?.entityType).toBe("CERTIFICATE");

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSetPasswordEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEnrollmentCompleteEmailMock).toHaveBeenCalledTimes(1);
  });

  test("confirm-session is read-only and cannot mutate payment, certificate, or employer status", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Confirm Carrier",
        address: "2 Test St",
        phone: "3135550101",
        email: "confirm@example.com",
        status: "INACTIVE"
      }
    });
    const certDoc = await testPrisma.document.create({
      data: {
        employerId: employer.id,
        entityType: "CERTIFICATE",
        entityId: "CERT-CS-1",
        storageKey: "certs/CERT-CS-1.pdf",
        filename: "CERT-CS-1.pdf",
        contentType: "application/pdf",
        retentionCategory: "CERTIFICATE"
      }
    });
    await testPrisma.enrollmentCertificate.create({
      data: {
        id: "CERT-CS-1",
        employerId: employer.id,
        effectiveDate: new Date("2026-01-01"),
        expirationDate: new Date("2027-01-01"),
        status: "ACTIVE",
        documentId: certDoc.id
      }
    });

    const testRequest = await testPrisma.testRequest.create({
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
        testRequestId: testRequest.id,
        type: "TEST_REQUEST",
        amountCents: 7500,
        status: "PENDING",
        stripeSessionId: "cs_confirm_1"
      }
    });
    const token = await createCheckoutConfirmToken({
      stripeSessionId: "cs_confirm_1"
    });

    stripeRetrieveMock.mockResolvedValue({
      id: "cs_confirm_1",
      status: "complete",
      payment_status: "paid",
      metadata: { kind: "TEST_REQUEST" }
    });
    authMock.mockResolvedValue(null);

    const beforePaid = await testPrisma.payment.findUnique({
      where: { stripeSessionId: "cs_confirm_1" }
    });
    const beforeEmployer = await testPrisma.employer.findUnique({
      where: { id: employer.id }
    });
    const beforeCerts = await testPrisma.enrollmentCertificate.findMany({
      where: { employerId: employer.id },
      orderBy: { id: "asc" }
    });

    const { POST } = await import("@/app/api/stripe/confirm-session/route");
    const response = await POST(
      new Request("http://localhost/api/stripe/confirm-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "cs_confirm_1",
          confirmToken: token.raw
        })
      })
    );
    expect(response.status).toBe(200);

    const afterPaid = await testPrisma.payment.findUnique({
      where: { stripeSessionId: "cs_confirm_1" }
    });
    const afterEmployer = await testPrisma.employer.findUnique({
      where: { id: employer.id }
    });
    const afterCerts = await testPrisma.enrollmentCertificate.findMany({
      where: { employerId: employer.id },
      orderBy: { id: "asc" }
    });

    expect(beforePaid?.status).toBe("PENDING");
    expect(afterPaid?.status).toBe("PENDING");
    expect(beforeEmployer?.status).toBe("INACTIVE");
    expect(afterEmployer?.status).toBe("INACTIVE");
    expect(beforeCerts.length).toBe(afterCerts.length);
    expect(beforeCerts[0]?.id).toBe(afterCerts[0]?.id);
    expect(beforeCerts[0]?.status).toBe(afterCerts[0]?.status);
  });

  test("portal test request payment transitions from PENDING_PAYMENT to REQUESTED on webhook", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Payment Carrier",
        address: "3 Test Ave",
        phone: "3135550102",
        email: "pay@example.com",
        status: "ACTIVE"
      }
    });
    const request = await testPrisma.testRequest.create({
      data: {
        employerId: employer.id,
        reason: "USER_REQUEST",
        testType: "BOTH",
        status: "PENDING_PAYMENT",
        priceCents: 12500,
        paid: false
      }
    });

    await processCheckoutSessionCompleted(
      fakeCompletedSession({
        id: "cs_test_payment_1",
        kind: "TEST_REQUEST",
        metadata: {
          testRequestId: request.id,
          employerId: employer.id
        },
        amountTotal: 12500
      })
    );

    const updated = await testPrisma.testRequest.findUnique({
      where: { id: request.id }
    });
    expect(updated?.paid).toBe(true);
    expect(updated?.status).toBe("REQUESTED");
  });

  test("portal document tenant isolation blocks cross-employer access", async () => {
    const [employerA, employerB] = await Promise.all([
      testPrisma.employer.create({
        data: {
          legalName: "Employer A",
          address: "10 A St",
          phone: "3135550103",
          email: "a@example.com",
          status: "ACTIVE"
        }
      }),
      testPrisma.employer.create({
        data: {
          legalName: "Employer B",
          address: "10 B St",
          phone: "3135550104",
          email: "b@example.com",
          status: "ACTIVE"
        }
      })
    ]);

    const aRequest = await testPrisma.testRequest.create({
      data: {
        employerId: employerA.id,
        reason: "USER_REQUEST",
        testType: "DRUG",
        status: "COMPLETED",
        paid: true,
        resultStatus: "NEGATIVE",
        resultDate: new Date("2026-03-01"),
        resultReportedAt: new Date("2026-03-01")
      }
    });
    const aDoc = await testPrisma.document.create({
      data: {
        employerId: employerA.id,
        entityType: "TEST_REQUEST",
        entityId: aRequest.id,
        storageKey: "test/a-doc.pdf",
        filename: "a-doc.pdf",
        contentType: "application/pdf",
        retentionCategory: "OTHER"
      }
    });

    const bRequest = await testPrisma.testRequest.create({
      data: {
        employerId: employerB.id,
        reason: "USER_REQUEST",
        testType: "DRUG",
        status: "COMPLETED",
        paid: true,
        resultStatus: "NEGATIVE",
        resultDate: new Date("2026-03-01"),
        resultReportedAt: new Date("2026-03-01")
      }
    });
    const bDoc = await testPrisma.document.create({
      data: {
        employerId: employerB.id,
        entityType: "TEST_REQUEST",
        entityId: bRequest.id,
        storageKey: "test/b-doc.pdf",
        filename: "b-doc.pdf",
        contentType: "application/pdf",
        retentionCategory: "OTHER"
      }
    });

    authMock.mockResolvedValue({
      user: {
        id: "der-a",
        role: "EMPLOYER_DER",
        employerId: employerA.id,
        emailVerifiedAt: new Date().toISOString()
      }
    });

    const docsRoute = await import("@/app/api/portal/test-requests/[id]/documents/route");
    const docsResponse = await docsRoute.GET(new Request("http://localhost/api/portal/test-requests/x/documents"), {
      params: { id: bRequest.id }
    });
    expect([403, 404]).toContain(docsResponse.status);

    const downloadRoute = await import("@/app/api/documents/[id]/download/route");
    const ownDlResponse = await downloadRoute.GET(new Request("http://localhost/api/documents/x/download"), {
      params: { id: aDoc.id }
    });
    expect(ownDlResponse.status).toBe(200);

    const dlResponse = await downloadRoute.GET(new Request("http://localhost/api/documents/x/download"), {
      params: { id: bDoc.id }
    });
    expect([403, 404]).toContain(dlResponse.status);

    authMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date().toISOString()
      }
    });
    const adminDlResponse = await downloadRoute.GET(new Request("http://localhost/api/documents/x/download"), {
      params: { id: bDoc.id }
    });
    expect(adminDlResponse.status).toBe(200);
  });

  test("public certificate verification reports ACTIVE then VOID state", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "admin-verify@example.com",
        fullName: "Admin Verify",
        role: "CTPA_ADMIN"
      }
    });
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Verify Carrier",
        dotNumber: "US1234567",
        address: "4 Verify St",
        phone: "3135550105",
        email: "verify@example.com",
        status: "ACTIVE"
      }
    });
    const doc = await testPrisma.document.create({
      data: {
        employerId: employer.id,
        entityType: "CERTIFICATE",
        entityId: "CERT-V-1",
        storageKey: "certs/CERT-V-1.pdf",
        filename: "CERT-V-1.pdf",
        contentType: "application/pdf",
        retentionCategory: "CERTIFICATE"
      }
    });
    await testPrisma.enrollmentCertificate.create({
      data: {
        id: "CERT-V-1",
        employerId: employer.id,
        effectiveDate: new Date("2026-01-01"),
        expirationDate: new Date("2027-01-01"),
        status: "ACTIVE",
        documentId: doc.id
      }
    });

    const verifyRoute = await import("@/app/api/public/certificates/[certificateId]/route");
    const activeResponse = await verifyRoute.GET(new Request("http://localhost/api/public/certificates/CERT-V-1"), {
      params: { certificateId: "CERT-V-1" }
    });
    expect(activeResponse.status).toBe(200);
    const activePayload = await activeResponse.json();
    expect(Object.keys(activePayload).sort()).toEqual(
      ["certificateId", "dotNumber", "effectiveDate", "expirationDate", "legalName", "status"].sort()
    );
    expect(activePayload.status).toBe("ACTIVE");

    await voidEnrollmentCertificate({
      certificateId: "CERT-V-1",
      reason: "Voided for superseded enrollment record",
      actorUserId: admin.id
    });

    const voidResponse = await verifyRoute.GET(new Request("http://localhost/api/public/certificates/CERT-V-1"), {
      params: { certificateId: "CERT-V-1" }
    });
    expect(voidResponse.status).toBe(200);
    const voidPayload = await voidResponse.json();
    expect(voidPayload.status).toBe("VOID");
  });

  test("raw documents endpoint returns 404 in production", async () => {
    const previousEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const route = await import("@/app/api/documents/raw/route");
      const response = await route.GET(
        new Request("http://localhost/api/documents/raw?key=a&exp=9999999999&sig=abc&filename=x.pdf")
      );
      expect(response.status).toBe(404);
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  test("renewal webhook sets employer ACTIVE and advances renewal date", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Renew Carrier",
        address: "5 Renew St",
        phone: "3135550106",
        email: "renew@example.com",
        status: "INACTIVE",
        renewalDueDate: new Date("2026-01-01")
      }
    });

    await processCheckoutSessionCompleted(
      fakeCompletedSession({
        id: "cs_renew_1",
        kind: "RENEWAL",
        metadata: { employerId: employer.id },
        amountTotal: 9900
      })
    );

    const updated = await testPrisma.employer.findUnique({
      where: { id: employer.id }
    });
    expect(updated?.status).toBe("ACTIVE");
    expect(updated?.renewalDueDate && updated.renewalDueDate > new Date("2026-01-01")).toBe(true);
    expect(sendRenewalReceiptEmailMock).toHaveBeenCalledTimes(1);
  });

  test("admin results endpoint sorts by resultReportedAt desc then id", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Results Carrier",
        address: "6 Results Ave",
        phone: "3135550107",
        email: "results@example.com",
        status: "ACTIVE"
      }
    });

    const requestOld = await testPrisma.testRequest.create({
      data: {
        employerId: employer.id,
        reason: "USER_REQUEST",
        testType: "DRUG",
        paid: true,
        status: "COMPLETED",
        resultStatus: "NEGATIVE",
        resultDate: new Date("2026-01-10"),
        resultReportedAt: new Date("2026-01-10T10:00:00.000Z")
      }
    });
    const requestNew = await testPrisma.testRequest.create({
      data: {
        employerId: employer.id,
        reason: "USER_REQUEST",
        testType: "ALCOHOL",
        paid: true,
        status: "COMPLETED",
        resultStatus: "NEGATIVE",
        resultDate: new Date("2026-02-15"),
        resultReportedAt: new Date("2026-02-15T10:00:00.000Z")
      }
    });

    authMock.mockResolvedValue({
      user: {
        id: "admin-results",
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date().toISOString()
      }
    });
    const { GET } = await import("@/app/api/admin/results/route");
    const response = await GET(new Request("http://localhost/api/admin/results?limit=10"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].id).toBe(requestNew.id);
    expect(payload.items[1].id).toBe(requestOld.id);
  });
});
