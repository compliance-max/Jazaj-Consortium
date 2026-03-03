import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { ENROLLMENT_ANNUAL_CENTS } from "@/lib/billing/pricing";

function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

function requireStripe() {
  return getStripeClient();
}

type BaseCheckoutInput = {
  amountCents: number;
  description: string;
  metadata: Record<string, string>;
  customerEmail?: string | null;
  successPath: string;
  cancelPath: string;
};

async function createCheckout(input: BaseCheckoutInput) {
  const stripe = requireStripe();
  const urlBase = appUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail || undefined,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: input.description
          }
        }
      }
    ],
    metadata: input.metadata,
    success_url: `${urlBase}${input.successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${urlBase}${input.cancelPath}`
  });

  return session;
}

export async function createEnrollmentCheckoutSession(input: {
  submissionId: string;
  customerEmail: string;
}) {
  return createCheckout({
    amountCents: ENROLLMENT_ANNUAL_CENTS,
    description: "Consortium Annual Enrollment",
    metadata: {
      kind: "ENROLLMENT",
      submissionId: input.submissionId
    },
    customerEmail: input.customerEmail,
    successPath: "/enroll",
    cancelPath: "/enroll"
  });
}

export async function createRenewalCheckoutSession(input: {
  employerId: string;
  customerEmail?: string | null;
  amountCents: number;
}) {
  return createCheckout({
    amountCents: input.amountCents,
    description: "Consortium Annual Renewal",
    metadata: {
      kind: "RENEWAL",
      employerId: input.employerId
    },
    customerEmail: input.customerEmail,
    successPath: "/portal/company",
    cancelPath: "/portal/company"
  });
}

export async function createTestRequestCheckoutSession(input: {
  testRequestId: string;
  employerId: string;
  customerEmail?: string | null;
  amountCents: number;
}) {
  return createCheckout({
    amountCents: input.amountCents,
    description: "Consortium Test Request",
    metadata: {
      kind: "TEST_REQUEST",
      testRequestId: input.testRequestId,
      employerId: input.employerId
    },
    customerEmail: input.customerEmail,
    successPath: "/portal/test-requests",
    cancelPath: "/portal/test-requests"
  });
}

export function sessionPaid(session: Pick<Stripe.Checkout.Session, "payment_status">) {
  return session.payment_status === "paid";
}
