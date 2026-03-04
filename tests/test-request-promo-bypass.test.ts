import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";

const { createTestRequestCheckoutSessionMock } = vi.hoisted(() => ({
  createTestRequestCheckoutSessionMock: vi.fn()
}));

const emailMocks = vi.hoisted(() => ({
  sendTestPaymentReceiptEmailMock: vi.fn(),
  sendClinicAssignmentEmailMock: vi.fn(),
  sendResultPostedEmailMock: vi.fn()
}));

vi.mock("@/lib/services/stripe-checkout", () => ({
  createTestRequestCheckoutSession: createTestRequestCheckoutSessionMock
}));

vi.mock("@/lib/email/postmark", () => ({
  sendTestPaymentReceiptEmail: emailMocks.sendTestPaymentReceiptEmailMock,
  sendClinicAssignmentEmail: emailMocks.sendClinicAssignmentEmailMock,
  sendResultPostedEmail: emailMocks.sendResultPostedEmailMock
}));

describe("test request promo bypass", () => {
  const previousEnv = { ...process.env };

  beforeEach(async () => {
    await clearDatabase();
    process.env = { ...previousEnv };
    process.env.NODE_ENV = "test";
    process.env.DEMO_MODE = "false";
    process.env.PROMO_JAZAJ_ENABLED = "true";
    process.env.PROMO_JAZAJ_CODE = "jazaj";
    createTestRequestCheckoutSessionMock.mockReset();
    emailMocks.sendTestPaymentReceiptEmailMock.mockReset();
    emailMocks.sendClinicAssignmentEmailMock.mockReset();
    emailMocks.sendResultPostedEmailMock.mockReset();
    createTestRequestCheckoutSessionMock.mockResolvedValue({
      id: "cs_test_request_1",
      url: "https://checkout.stripe.test/request_1"
    });
  });

  test("create test request bypasses Stripe when promo matches", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Promo Employer",
        address: "1 Main St",
        phone: "3135550100",
        email: "promo-employer@example.com",
        status: "ACTIVE"
      }
    });

    const { createTestRequestWithCheckout } = await import("@/lib/services/test-requests");
    const result = await createTestRequestWithCheckout({
      employerId: employer.id,
      requestedByUserId: null,
      customerEmail: employer.email,
      testType: "DRUG",
      reason: "USER_REQUEST",
      promoCode: "JAZAJ"
    });

    expect(result.kind).toBe("PROMO");
    expect("paid" in result ? result.paid : false).toBe(true);
    expect(createTestRequestCheckoutSessionMock).not.toHaveBeenCalled();

    const request = await testPrisma.testRequest.findUnique({
      where: { id: result.request.id }
    });
    expect(request?.status).toBe("REQUESTED");
    expect(request?.paid).toBe(true);
    expect(request?.priceCents).toBe(0);

    const payment = await testPrisma.payment.findFirst({
      where: { testRequestId: result.request.id }
    });
    expect(payment?.status).toBe("PAID");
    expect(payment?.amountCents).toBe(0);
    expect(payment?.method).toBe("PROMO");
  });

  test("checkout on pending request bypasses Stripe when promo matches", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Promo Checkout Employer",
        address: "2 Main St",
        phone: "3135550101",
        email: "promo-checkout@example.com",
        status: "ACTIVE"
      }
    });

    const request = await testPrisma.testRequest.create({
      data: {
        employerId: employer.id,
        reason: "USER_REQUEST",
        testType: "ALCOHOL",
        status: "PENDING_PAYMENT",
        paid: false,
        priceCents: 5000
      }
    });

    const { createCheckoutForExistingPendingRequest } = await import("@/lib/services/test-requests");
    const result = await createCheckoutForExistingPendingRequest({
      requestId: request.id,
      employerId: employer.id,
      customerEmail: employer.email,
      promoCode: "jazaj"
    });

    expect(result.kind).toBe("PROMO");
    expect("paid" in result ? result.paid : false).toBe(true);
    expect(createTestRequestCheckoutSessionMock).not.toHaveBeenCalled();

    const updated = await testPrisma.testRequest.findUnique({
      where: { id: request.id }
    });
    expect(updated?.status).toBe("REQUESTED");
    expect(updated?.paid).toBe(true);
    expect(updated?.priceCents).toBe(0);

    const payment = await testPrisma.payment.findFirst({
      where: { testRequestId: request.id }
    });
    expect(payment?.status).toBe("PAID");
    expect(payment?.amountCents).toBe(0);
    expect(payment?.method).toBe("PROMO");
  });
});
