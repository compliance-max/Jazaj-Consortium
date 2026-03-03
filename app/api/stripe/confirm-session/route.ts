import { z } from "zod";
import { auth } from "@/auth";
import { fail, ok } from "@/lib/http";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { consumeCheckoutConfirmToken } from "@/lib/services/checkout-confirm-token";
import { readCheckoutSessionStatus } from "@/lib/services/payments";
import { createLogger } from "@/lib/logging/logger";

const schema = z.object({
  sessionId: z.string().min(5),
  confirmToken: z.string().min(10).optional()
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({ requestId, route: "/api/stripe/confirm-session", method: "POST" });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 422);

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limiter = await consumeRateLimit({
    namespace: "stripe_confirm_session",
    key: `${parsed.data.sessionId}:${ip}`,
    limit: 30,
    windowMs: 10 * 60_000
  });
  if (!limiter.ok) return fail("Too many requests", 429);

  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);

  if (!isAuthenticated) {
    if (!parsed.data.confirmToken) return fail("Authentication or confirm token required", 401);
    const token = await consumeCheckoutConfirmToken({
      stripeSessionId: parsed.data.sessionId,
      token: parsed.data.confirmToken
    });
    if (!token.ok) return fail("Invalid or expired confirm token", 401);
  }

  const status = await readCheckoutSessionStatus(parsed.data.sessionId);
  logger.info("Confirm session read-only check", {
    sessionId: parsed.data.sessionId,
    paid: status.paid
  });
  return ok(status);
}
