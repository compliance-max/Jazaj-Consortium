import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db/prisma";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createEnrollmentCheckoutSession } from "@/lib/services/stripe-checkout";
import { createCheckoutConfirmToken } from "@/lib/services/checkout-confirm-token";
import { processPromoEnrollmentBypass } from "@/lib/services/payments";
import { enrollmentSchema, normalizeEnrollmentInput } from "@/lib/validation/enrollment";
import { createLogger } from "@/lib/logging/logger";

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({ requestId, route: "/api/enroll", method: "POST" });
  const body = await req.json().catch(() => null);
  const parsed = enrollmentSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422, { requestId });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limiter = await consumeRateLimit({
    namespace: "enroll_submit",
    key: `${parsed.data.contactEmail.toLowerCase()}:${ip}`,
    limit: 10,
    windowMs: 60 * 60_000
  });
  if (!limiter.ok) return fail("Too many enrollment attempts", 429, { requestId });

  const payload = normalizeEnrollmentInput(parsed.data);
  const code = (parsed.data.promoCode || "").trim().toLowerCase();
  const expectedCode = (process.env.PROMO_JAZAJ_CODE || "jazaj").trim().toLowerCase();
  const bypassAllowed = process.env.DEMO_MODE === "true" || process.env.PROMO_JAZAJ_ENABLED === "true";
  const promoMatches = code.length > 0 && code === expectedCode;

  if (process.env.NODE_ENV !== "production") {
    console.log("ENROLL_PROMO_CHECK", {
      code,
      bypassAllowed,
      nodeEnv: process.env.NODE_ENV
    });
  }

  if (code) {
    const promoLimiter = await consumeRateLimit({
      namespace: "enroll_promo_attempt",
      key: ip,
      limit: 20,
      windowMs: 60 * 60_000
    });
    if (!promoLimiter.ok) return fail("Too many promo attempts", 429, { requestId });
  }

  const submission = await prisma.enrollmentSubmission.create({
    data: {
      payload,
      paid: false,
      status: "PENDING"
    }
  });

  if (promoMatches && bypassAllowed) {
    try {
      await processPromoEnrollmentBypass({
        submissionId: submission.id,
        promoCode: expectedCode
      });

      logger.info("Enrollment promo bypass completed", {
        submissionId: submission.id,
        promoCode: expectedCode
      });

      return ok({
        kind: "PROMO",
        success: true,
        submissionId: submission.id,
        redirectUrl: "/enroll?success=1"
      });
    } catch (error) {
      logger.error("Promo enrollment processing failed", {
        submissionId: submission.id,
        message: error instanceof Error ? error.message : "unknown"
      });
      await prisma.enrollmentSubmission.update({
        where: { id: submission.id },
        data: {
          status: "FAILED",
          paid: false
        }
      });
      if (process.env.NODE_ENV !== "production") {
        return fail(error instanceof Error ? error.message : "Promo enrollment failed", 500, { requestId });
      }
      return fail("Promo enrollment failed", 500, { requestId });
    }
  }

  try {
    const session = await createEnrollmentCheckoutSession({
      submissionId: submission.id,
      customerEmail: payload.contactEmail
    });

    const confirmToken = await createCheckoutConfirmToken({
      stripeSessionId: session.id
    });

    await prisma.enrollmentSubmission.update({
      where: { id: submission.id },
      data: {
        stripeSessionId: session.id,
        paid: false
      }
    });

    return ok({
      kind: "STRIPE",
      submissionId: submission.id,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      confirmToken: confirmToken.raw
    });
  } catch (error) {
    logger.error("Enrollment checkout creation failed", {
      submissionId: submission.id,
      message: error instanceof Error ? error.message : "unknown"
    });
    await prisma.enrollmentSubmission.update({
      where: { id: submission.id },
      data: {
        status: "FAILED"
      }
    });
    if (process.env.NODE_ENV !== "production") {
      return fail(error instanceof Error ? error.message : "Checkout creation failed", 500, { requestId });
    }
    return fail("Checkout creation failed", 500, { requestId });
  }
}
