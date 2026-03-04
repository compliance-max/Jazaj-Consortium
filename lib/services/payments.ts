import Stripe from "stripe";
import { Prisma, TestType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAccountToken } from "@/lib/tokens/service";
import {
  sendRenewalReceiptEmail,
  sendEnrollmentCompleteEmail,
  sendSetPasswordEmail,
  sendTestPaymentReceiptEmail,
  sendVerificationEmail
} from "@/lib/email/postmark";
import { assignDriverToEmployerPool, ensureEmployerActivePool } from "@/lib/services/pools";
import { getStripeClient } from "@/lib/stripe/client";
import { buildDocumentDownloadUrl } from "@/lib/storage/documents";
import { issueEnrollmentCertificate, regenerateEnrollmentCertificate } from "@/lib/services/certificates";
import { testTypePriceCents } from "@/lib/billing/pricing";

type EnrollmentPayloadDriver = {
  firstName: string;
  lastName: string;
  dob: string;
  cdlNumber?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
  dotCovered?: boolean;
  active?: boolean;
};

type EnrollmentPayload = {
  legalName: string;
  dotNumber?: string | null;
  address: string;
  phone: string;
  contactName: string;
  contactEmail: string;
  promoCode?: string | null;
  timezone?: string;
  poolMode?: "MASTER" | "INDIVIDUAL";
  drivers?: EnrollmentPayloadDriver[];
  processedEmployerId?: string;
};

function parseEnrollmentPayload(payload: Prisma.JsonValue): EnrollmentPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_ENROLLMENT_PAYLOAD");
  }
  const parsed = payload as Record<string, unknown>;
  return {
    legalName: String(parsed.legalName || "").trim(),
    dotNumber: parsed.dotNumber ? String(parsed.dotNumber).trim().toUpperCase() : null,
    address: String(parsed.address || "").trim(),
    phone: String(parsed.phone || "").trim(),
    contactName: String(parsed.contactName || "").trim(),
    contactEmail: String(parsed.contactEmail || "").trim().toLowerCase(),
    promoCode: parsed.promoCode ? String(parsed.promoCode).trim() : null,
    timezone: parsed.timezone ? String(parsed.timezone).trim() : "America/Detroit",
    poolMode: parsed.poolMode === "MASTER" ? "MASTER" : "INDIVIDUAL",
    drivers: Array.isArray(parsed.drivers)
      ? (parsed.drivers as unknown[]).map((row) => {
          const obj = (row || {}) as Record<string, unknown>;
          return {
            firstName: String(obj.firstName || "").trim(),
            lastName: String(obj.lastName || "").trim(),
            dob: String(obj.dob || ""),
            cdlNumber: obj.cdlNumber ? String(obj.cdlNumber).trim().toUpperCase() : null,
            state: obj.state ? String(obj.state).trim().toUpperCase() : null,
            email: obj.email ? String(obj.email).trim().toLowerCase() : null,
            phone: obj.phone ? String(obj.phone).trim() : null,
            dotCovered: obj.dotCovered !== false,
            active: obj.active !== false
          };
        })
      : [],
    processedEmployerId: parsed.processedEmployerId ? String(parsed.processedEmployerId) : undefined
  };
}

function addOneYear(date: Date) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

async function upsertPaidPayment(input: {
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
  type: "ENROLLMENT" | "RENEWAL" | "TEST_REQUEST";
  amountCents: number;
  method?: string;
  reference?: string | null;
  employerId?: string | null;
  testRequestId?: string | null;
  enrollmentSubmissionId?: string | null;
}) {
  return prisma.payment.upsert({
    where: { stripeSessionId: input.stripeSessionId },
    create: {
      stripeSessionId: input.stripeSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId || null,
      type: input.type,
      amountCents: input.amountCents,
      status: "PAID",
      method: input.method || "STRIPE",
      reference: input.reference || null,
      paidAt: new Date(),
      employerId: input.employerId || null,
      testRequestId: input.testRequestId || null,
      enrollmentSubmissionId: input.enrollmentSubmissionId || null
    },
    update: {
      stripePaymentIntentId: input.stripePaymentIntentId || null,
      status: "PAID",
      paidAt: new Date(),
      amountCents: input.amountCents,
      method: input.method || "STRIPE",
      reference: input.reference || null,
      employerId: input.employerId || null,
      testRequestId: input.testRequestId || null,
      enrollmentSubmissionId: input.enrollmentSubmissionId || null
    }
  });
}

type EnrollmentFulfillmentInput = {
  submissionId: string;
  stripeSessionId: string;
  amountCents: number;
  stripePaymentIntentId?: string | null;
  paymentMethod?: string;
  paymentReference?: string | null;
  source: "STRIPE" | "PROMO";
};

async function fulfillEnrollmentSubmission(input: EnrollmentFulfillmentInput) {
  const submission = await prisma.enrollmentSubmission.findUnique({
    where: { id: input.submissionId }
  });
  if (!submission) throw new Error("ENROLLMENT_SUBMISSION_NOT_FOUND");

  const payload = parseEnrollmentPayload(submission.payload);

  if (submission.status === "PROCESSED" && payload.processedEmployerId) {
    if (!submission.paid) {
      await prisma.enrollmentSubmission.update({
        where: { id: submission.id },
        data: { paid: true }
      });
    }
    await upsertPaidPayment({
      stripeSessionId: input.stripeSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId || null,
      type: "ENROLLMENT",
      amountCents: input.amountCents,
      method: input.paymentMethod || "STRIPE",
      reference: input.paymentReference || null,
      employerId: payload.processedEmployerId,
      enrollmentSubmissionId: submission.id
    });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    const employer = await tx.employer.create({
      data: {
        legalName: payload.legalName,
        dotNumber: payload.dotNumber || null,
        address: payload.address,
        phone: payload.phone,
        email: payload.contactEmail,
        status: "ACTIVE",
        timezone: payload.timezone || "America/Detroit",
        poolMode: payload.poolMode || "INDIVIDUAL",
        renewalDueDate: addOneYear(new Date())
      }
    });

    const derUser = await tx.employerUser.create({
      data: {
        email: payload.contactEmail,
        fullName: payload.contactName,
        role: "EMPLOYER_DER",
        employerId: employer.id,
        passwordSet: false,
        invitedAt: new Date()
      }
    });

    await ensureEmployerActivePool(tx, {
      id: employer.id,
      poolMode: employer.poolMode,
      timezone: employer.timezone,
      activePoolId: employer.activePoolId
    });

    for (const row of payload.drivers || []) {
      if (!row.firstName || !row.lastName || !row.dob) continue;
      const driver = await tx.driver.create({
        data: {
          employerId: employer.id,
          firstName: row.firstName,
          lastName: row.lastName,
          dob: new Date(row.dob),
          cdlNumber: row.cdlNumber || null,
          state: row.state || null,
          email: row.email || null,
          phone: row.phone || null,
          dotCovered: row.dotCovered !== false,
          active: row.active !== false
        }
      });

      if (driver.active) {
        await assignDriverToEmployerPool(tx, {
          driverId: driver.id,
          employerId: employer.id,
          changedByUserId: null,
          reason: "enrollment_driver_seed"
        });
      }
    }

    await tx.enrollmentSubmission.update({
      where: { id: submission.id },
      data: {
        stripeSessionId: input.stripeSessionId,
        paid: true,
        status: "PROCESSED",
        payload: {
          ...(submission.payload as Record<string, unknown>),
          processedEmployerId: employer.id
        }
      }
    });

    await tx.auditLog.create({
      data: {
        userId: null,
        employerId: employer.id,
        action: "ENROLLMENT_COMPLETED",
        entityType: "EnrollmentSubmission",
        entityId: submission.id,
        metadata: {
          stripeSessionId: input.stripeSessionId,
          source: input.source,
          paymentMethod: input.paymentMethod || "STRIPE"
        }
      }
    });

    return { employer, derUser };
  });

  await upsertPaidPayment({
    stripeSessionId: input.stripeSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId || null,
    type: "ENROLLMENT",
    amountCents: input.amountCents,
    method: input.paymentMethod || "STRIPE",
    reference: input.paymentReference || null,
    employerId: created.employer.id,
    enrollmentSubmissionId: input.submissionId
  });

  const [verifyToken, setPasswordToken] = await Promise.all([
    createAccountToken({ userId: created.derUser.id, type: "EMAIL_VERIFICATION" }),
    createAccountToken({ userId: created.derUser.id, type: "SET_PASSWORD" })
  ]);

  const certificateBundle = await issueEnrollmentCertificate({
    employerId: created.employer.id
  });
  const certificateUrl = await buildDocumentDownloadUrl({
    storageKey: certificateBundle.document.storageKey,
    filename: certificateBundle.document.filename,
    contentType: certificateBundle.document.contentType
  });

  await Promise.all([
    sendVerificationEmail({
      to: created.derUser.email,
      token: verifyToken.raw
    }),
    sendSetPasswordEmail({
      to: created.derUser.email,
      token: setPasswordToken.raw
    }),
    sendEnrollmentCompleteEmail({
      to: created.derUser.email,
      legalName: created.employer.legalName,
      certificateId: certificateBundle.certificate.id,
      certificateUrl,
      pdfAttachment: certificateBundle.pdfBytes
    })
  ]);
}

async function processEnrollmentSession(session: Stripe.Checkout.Session) {
  const submissionId = session.metadata?.submissionId;
  if (!submissionId) throw new Error("MISSING_SUBMISSION_ID");

  await fulfillEnrollmentSubmission({
    submissionId,
    stripeSessionId: session.id,
    amountCents: session.amount_total || 0,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    paymentMethod: "STRIPE",
    source: "STRIPE"
  });
}

export async function processPromoEnrollmentBypass(input: {
  submissionId: string;
  promoCode: string;
}) {
  const now = Date.now();
  const promoSessionId = `promo-enrollment-${input.submissionId}-${now}`;
  await fulfillEnrollmentSubmission({
    submissionId: input.submissionId,
    stripeSessionId: promoSessionId,
    amountCents: 0,
    paymentMethod: "PROMO",
    paymentReference: input.promoCode.trim().toLowerCase(),
    source: "PROMO"
  });
}

async function processRenewalSession(session: Stripe.Checkout.Session) {
  const employerId = session.metadata?.employerId;
  if (!employerId) throw new Error("MISSING_EMPLOYER_ID");
  const employer = await prisma.employer.findUnique({
    where: { id: employerId }
  });
  if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

  const base = employer.renewalDueDate && employer.renewalDueDate > new Date() ? employer.renewalDueDate : new Date();
  const newRenewalDueDate = addOneYear(base);

  await prisma.employer.update({
    where: { id: employer.id },
    data: {
      status: "ACTIVE",
      renewalDueDate: newRenewalDueDate
    }
  });

  await upsertPaidPayment({
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    type: "RENEWAL",
    amountCents: session.amount_total || 0,
    employerId: employer.id
  });

  await regenerateEnrollmentCertificate({
    employerId: employer.id,
    actorUserId: await getAnyAdminUserId()
  });

  await sendRenewalReceiptEmail({
    to: employer.email,
    legalName: employer.legalName,
    amountCents: session.amount_total || 0,
    renewalDueDate: newRenewalDueDate
  });

  await prisma.auditLog.create({
    data: {
      userId: null,
      employerId: employer.id,
      action: "RENEWAL_PAID",
      entityType: "Employer",
      entityId: employer.id,
      metadata: {
        stripeSessionId: session.id,
        renewalDueDate: newRenewalDueDate.toISOString()
      }
    }
  });
}

async function getAnyAdminUserId() {
  const admin = await prisma.employerUser.findFirst({
    where: {
      role: {
        in: ["CTPA_ADMIN", "CTPA_MANAGER"]
      }
    },
    select: { id: true }
  });
  return admin?.id || null;
}

async function processTestRequestSession(session: Stripe.Checkout.Session) {
  const testRequestId = session.metadata?.testRequestId;
  if (!testRequestId) throw new Error("MISSING_TEST_REQUEST_ID");

  const request = await prisma.testRequest.findUnique({
    where: { id: testRequestId },
    include: {
      employer: true
    }
  });
  if (!request) throw new Error("TEST_REQUEST_NOT_FOUND");

  await prisma.testRequest.update({
    where: { id: request.id },
    data: {
      paid: true,
      status: "REQUESTED",
      priceCents: request.priceCents || testTypePriceCents(request.testType as TestType)
    }
  });

  await upsertPaidPayment({
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    type: "TEST_REQUEST",
    amountCents: session.amount_total || request.priceCents,
    employerId: request.employerId,
    testRequestId: request.id
  });

  await sendTestPaymentReceiptEmail({
    to: request.employer.email,
    requestId: request.id,
    amountCents: session.amount_total || request.priceCents
  });

  await prisma.auditLog.create({
    data: {
      userId: null,
      employerId: request.employerId,
      action: "TEST_REQUEST_PAID",
      entityType: "TestRequest",
      entityId: request.id,
      metadata: {
        stripeSessionId: session.id
      }
    }
  });
}

export async function processCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const kind = session.metadata?.kind;
  if (kind === "ENROLLMENT") {
    await processEnrollmentSession(session);
    return;
  }
  if (kind === "RENEWAL") {
    await processRenewalSession(session);
    return;
  }
  if (kind === "TEST_REQUEST") {
    await processTestRequestSession(session);
    return;
  }
}

export async function readCheckoutSessionStatus(sessionId: string) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    paid: session.payment_status === "paid",
    status: session.status || null,
    kind: session.metadata?.kind || null
  };
}
