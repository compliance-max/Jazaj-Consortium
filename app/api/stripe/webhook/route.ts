import Stripe from "stripe";
import { fail, ok } from "@/lib/http";
import { getStripeClient } from "@/lib/stripe/client";
import { processCheckoutSessionCompleted } from "@/lib/services/payments";

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return fail("Webhook not configured", 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail("Missing signature", 400);

  const stripe = getStripeClient();
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid signature", 400);
  }

  if (event.type === "checkout.session.completed") {
    await processCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
  }

  return ok({ received: true });
}
