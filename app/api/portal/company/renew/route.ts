import { fail, ok } from "@/lib/http";
import { requirePortalContext } from "@/lib/auth/guard";
import { createRenewalCheckoutSession } from "@/lib/services/stripe-checkout";
import { createCheckoutConfirmToken } from "@/lib/services/checkout-confirm-token";
import { PRICE_RENEWAL_ANNUAL_CENTS } from "@/lib/billing/pricing";

export async function POST() {
  try {
    const { user, employer } = await requirePortalContext();
    const session = await createRenewalCheckoutSession({
      employerId: employer.id,
      customerEmail: user.email || employer.email,
      amountCents: PRICE_RENEWAL_ANNUAL_CENTS
    });

    const confirmToken = await createCheckoutConfirmToken({
      stripeSessionId: session.id
    });

    return ok({
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      confirmToken: confirmToken.raw
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return fail(error instanceof Error ? error.message : "Unauthorized", 401);
    }
    return fail("Unauthorized", 401);
  }
}
