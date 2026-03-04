import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";

const { createEnrollmentCheckoutSessionMock } = vi.hoisted(() => ({
  createEnrollmentCheckoutSessionMock: vi.fn()
}));

vi.mock("@/lib/services/stripe-checkout", () => ({
  createEnrollmentCheckoutSession: createEnrollmentCheckoutSessionMock
}));

describe("enrollment promo bypass", () => {
  const previousEnv = { ...process.env };

  beforeEach(async () => {
    await clearDatabase();
    createEnrollmentCheckoutSessionMock.mockReset();
    createEnrollmentCheckoutSessionMock.mockResolvedValue({
      id: "cs_test_enroll_1",
      url: "https://checkout.stripe.test/session_1"
    });
    process.env = { ...previousEnv };
    process.env.NODE_ENV = "test";
    process.env.DEMO_MODE = "false";
    process.env.PROMO_JAZAJ_ENABLED = "false";
    process.env.PROMO_JAZAJ_CODE = "jazaj";
    process.env.ALLOW_EMAIL_CONSOLE_FALLBACK = "true";
    process.env.POSTMARK_SERVER_TOKEN = "";
    process.env.EMAIL_FROM = "";
  });

  test("promo code works in non-production when enabled and skips Stripe", async () => {
    process.env.PROMO_JAZAJ_ENABLED = "true";

    const { POST } = await import("@/app/api/enroll/route");
    const response = await POST(
      new Request("http://localhost/api/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.4"
        },
        body: JSON.stringify({
          legalName: "Promo Carrier",
          dotNumber: "USDOT123456",
          address: "123 Main St",
          phone: "3135550199",
          contactName: "Promo DER",
          contactEmail: "promo-der@example.com",
          promoCode: "JAZAJ",
          timezone: "America/Detroit",
          drivers: [
            {
              firstName: "John",
              lastName: "Doe",
              dob: "1990-01-01",
              cdlNumber: "CDL-1",
              state: "MI"
            }
          ]
        })
      })
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.kind).toBe("PROMO");
    expect(payload.success).toBe(true);
    expect(createEnrollmentCheckoutSessionMock).not.toHaveBeenCalled();

    const employer = await testPrisma.employer.findFirst({
      where: { email: "promo-der@example.com" }
    });
    expect(employer?.status).toBe("ACTIVE");

    const submission = await testPrisma.enrollmentSubmission.findFirst({
      where: {
        payload: {
          path: ["contactEmail"],
          equals: "promo-der@example.com"
        }
      }
    });
    expect(submission?.paid).toBe(true);
    expect(submission?.status).toBe("PROCESSED");

    const payment = await testPrisma.payment.findFirst({
      where: {
        employerId: employer?.id,
        type: "ENROLLMENT"
      }
    });
    expect(payment?.status).toBe("PAID");
    expect(payment?.amountCents).toBe(0);
    expect(payment?.method).toBe("PROMO");
    expect(payment?.reference).toBe("jazaj");

    const cert = await testPrisma.enrollmentCertificate.findFirst({
      where: { employerId: employer?.id }
    });
    expect(cert).toBeTruthy();
  });

  test("promo code is ignored when bypass is disabled", async () => {
    process.env.PROMO_JAZAJ_ENABLED = "false";

    const { POST } = await import("@/app/api/enroll/route");
    const response = await POST(
      new Request("http://localhost/api/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.5"
        },
        body: JSON.stringify({
          legalName: "Disabled Promo Carrier",
          address: "124 Main St",
          phone: "3135550198",
          contactName: "DER",
          contactEmail: "disabled-promo@example.com",
          promoCode: "jazaj"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.kind).toBe("STRIPE");
    expect(payload.checkoutUrl).toBe("https://checkout.stripe.test/session_1");
    expect(createEnrollmentCheckoutSessionMock).toHaveBeenCalledTimes(1);

    const employer = await testPrisma.employer.findFirst({
      where: { email: "disabled-promo@example.com" }
    });
    expect(employer).toBeNull();
  });

  test("promo code can be enabled in production mode with PROMO_JAZAJ_ENABLED", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROMO_JAZAJ_ENABLED = "true";

    const { POST } = await import("@/app/api/enroll/route");
    const response = await POST(
      new Request("http://localhost/api/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.6"
        },
        body: JSON.stringify({
          legalName: "Prod Promo Carrier",
          address: "125 Main St",
          phone: "3135550197",
          contactName: "DER",
          contactEmail: "prod-promo@example.com",
          promoCode: "jazaj"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.kind).toBe("PROMO");
    expect(payload.success).toBe(true);
    expect(createEnrollmentCheckoutSessionMock).not.toHaveBeenCalled();
  });

  test("wrong promo code does not bypass Stripe", async () => {
    process.env.PROMO_JAZAJ_ENABLED = "true";

    const { POST } = await import("@/app/api/enroll/route");
    const response = await POST(
      new Request("http://localhost/api/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.7"
        },
        body: JSON.stringify({
          legalName: "Wrong Promo Carrier",
          address: "126 Main St",
          phone: "3135550196",
          contactName: "DER",
          contactEmail: "wrong-promo@example.com",
          promoCode: "wrong-code"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.kind).toBe("STRIPE");
    expect(payload.checkoutUrl).toBe("https://checkout.stripe.test/session_1");
    expect(createEnrollmentCheckoutSessionMock).toHaveBeenCalledTimes(1);
  });

  test("missing promoCode uses Stripe path", async () => {
    process.env.PROMO_JAZAJ_ENABLED = "true";

    const { POST } = await import("@/app/api/enroll/route");
    const response = await POST(
      new Request("http://localhost/api/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.8"
        },
        body: JSON.stringify({
          legalName: "No Promo Carrier",
          address: "127 Main St",
          phone: "3135550195",
          contactName: "DER",
          contactEmail: "no-promo@example.com"
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.kind).toBe("STRIPE");
    expect(payload.checkoutUrl).toBe("https://checkout.stripe.test/session_1");
    expect(createEnrollmentCheckoutSessionMock).toHaveBeenCalledTimes(1);
  });
});
