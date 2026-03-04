import { Prisma, TestReason, TestRequestStatus, TestType, TestResultStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { testTypePriceCents } from "@/lib/billing/pricing";
import { createCheckoutConfirmToken } from "@/lib/services/checkout-confirm-token";
import { createTestRequestCheckoutSession } from "@/lib/services/stripe-checkout";
import { recalculateComplianceForPoolYear } from "@/lib/services/random/compliance";
import { sendClinicAssignmentEmail, sendResultPostedEmail, sendTestPaymentReceiptEmail } from "@/lib/email/postmark";
import { uploadDocumentBinary } from "@/lib/storage/documents";

function retentionCategoryForReason(reason: TestReason) {
  if (reason === "RANDOM") return "RANDOM" as const;
  return "OTHER" as const;
}

function normalizedPromoCode(input?: string | null) {
  return (input || "").trim().toLowerCase();
}

function promoConfig() {
  return {
    code: (process.env.PROMO_JAZAJ_CODE || "jazaj").trim().toLowerCase(),
    enabled: process.env.DEMO_MODE === "true" || process.env.PROMO_JAZAJ_ENABLED === "true"
  };
}

function isPromoBypass(input?: string | null) {
  const code = normalizedPromoCode(input);
  if (!code) return false;
  const config = promoConfig();
  return config.enabled && code === config.code;
}

export async function listPortalTestRequests(employerId: string) {
  return prisma.testRequest.findMany({
    where: { employerId },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },
      clinic: true,
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });
}

export async function createTestRequestWithCheckout(input: {
  employerId: string;
  requestedByUserId?: string | null;
  customerEmail?: string | null;
  driverId?: string | null;
  reason?: TestReason;
  testType: TestType;
  notes?: string | null;
  promoCode?: string | null;
}) {
  if (input.driverId) {
    const driver = await prisma.driver.findFirst({
      where: {
        id: input.driverId,
        employerId: input.employerId
      }
    });
    if (!driver) throw new Error("DRIVER_NOT_FOUND");
  }

  const priceCents = testTypePriceCents(input.testType);
  const promoBypass = isPromoBypass(input.promoCode);
  const promoCode = normalizedPromoCode(input.promoCode);

  const request = await prisma.testRequest.create({
    data: {
      employerId: input.employerId,
      requestedByUserId: input.requestedByUserId || null,
      driverId: input.driverId || null,
      reason: input.reason || "USER_REQUEST",
      testType: input.testType,
      priceCents: promoBypass ? 0 : priceCents,
      paid: promoBypass,
      status: promoBypass ? "REQUESTED" : "PENDING_PAYMENT",
      notes: input.notes || null
    }
  });

  if (promoBypass) {
    await prisma.payment.create({
      data: {
        employerId: input.employerId,
        testRequestId: request.id,
        type: "TEST_REQUEST",
        amountCents: 0,
        status: "PAID",
        method: "PROMO",
        reference: promoCode,
        paidAt: new Date(),
        stripeSessionId: `promo-test-${request.id}-${Date.now()}`
      }
    });

    const employer = await prisma.employer.findUnique({
      where: { id: input.employerId },
      select: { email: true }
    });
    if (employer?.email) {
      await sendTestPaymentReceiptEmail({
        to: employer.email,
        requestId: request.id,
        amountCents: 0
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: input.requestedByUserId || null,
        employerId: input.employerId,
        action: "TEST_REQUEST_CREATED_PROMO",
        entityType: "TestRequest",
        entityId: request.id,
        metadata: {
          status: "REQUESTED",
          priceCents: 0,
          method: "PROMO",
          promoCode
        }
      }
    });

    return {
      request,
      kind: "PROMO" as const,
      paid: true
    };
  }

  const session = await createTestRequestCheckoutSession({
    testRequestId: request.id,
    employerId: input.employerId,
    customerEmail: input.customerEmail || null,
    amountCents: priceCents
  });

  const confirmToken = await createCheckoutConfirmToken({
    stripeSessionId: session.id
  });

  await prisma.payment.create({
    data: {
      employerId: input.employerId,
      testRequestId: request.id,
      type: "TEST_REQUEST",
      amountCents: priceCents,
      status: "PENDING",
      stripeSessionId: session.id
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: input.requestedByUserId || null,
      employerId: input.employerId,
      action: "TEST_REQUEST_CREATED",
      entityType: "TestRequest",
      entityId: request.id,
      metadata: {
        status: request.status,
        priceCents
      }
    }
  });

  return {
    request,
    kind: "STRIPE" as const,
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
    confirmToken: confirmToken.raw
  };
}

export async function createCheckoutForExistingPendingRequest(input: {
  requestId: string;
  employerId: string;
  customerEmail?: string | null;
  promoCode?: string | null;
}) {
  const request = await prisma.testRequest.findFirst({
    where: {
      id: input.requestId,
      employerId: input.employerId
    }
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  if (request.paid || request.status !== "PENDING_PAYMENT") throw new Error("REQUEST_NOT_PENDING_PAYMENT");

  const promoBypass = isPromoBypass(input.promoCode);
  const promoCode = normalizedPromoCode(input.promoCode);
  if (promoBypass) {
    const updated = await prisma.testRequest.update({
      where: { id: request.id },
      data: {
        paid: true,
        status: "REQUESTED",
        priceCents: 0
      }
    });

    await prisma.payment.create({
      data: {
        employerId: request.employerId,
        testRequestId: request.id,
        type: "TEST_REQUEST",
        amountCents: 0,
        status: "PAID",
        method: "PROMO",
        reference: promoCode,
        paidAt: new Date(),
        stripeSessionId: `promo-test-${request.id}-${Date.now()}`
      }
    });

    const employer = await prisma.employer.findUnique({
      where: { id: request.employerId },
      select: { email: true }
    });
    if (employer?.email) {
      await sendTestPaymentReceiptEmail({
        to: employer.email,
        requestId: request.id,
        amountCents: 0
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: null,
        employerId: request.employerId,
        action: "TEST_REQUEST_PAID_PROMO",
        entityType: "TestRequest",
        entityId: request.id,
        metadata: {
          method: "PROMO",
          promoCode
        }
      }
    });

    return {
      kind: "PROMO" as const,
      paid: true,
      request: updated
    };
  }

  const session = await createTestRequestCheckoutSession({
    testRequestId: request.id,
    employerId: request.employerId,
    customerEmail: input.customerEmail || null,
    amountCents: request.priceCents || testTypePriceCents(request.testType)
  });
  const confirmToken = await createCheckoutConfirmToken({
    stripeSessionId: session.id
  });

  await prisma.payment.create({
    data: {
      employerId: request.employerId,
      testRequestId: request.id,
      type: "TEST_REQUEST",
      amountCents: request.priceCents || testTypePriceCents(request.testType),
      status: "PENDING",
      stripeSessionId: session.id
    }
  });

  return {
    kind: "STRIPE" as const,
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
    confirmToken: confirmToken.raw
  };
}

export async function listAdminTestRequests(input: {
  cursor?: string | null;
  limit: number;
  status?: TestRequestStatus | null;
  resultOnly?: boolean;
}) {
  const where: Prisma.TestRequestWhereInput = {};
  if (input.status) {
    where.status = input.status;
  }
  if (input.resultOnly) {
    where.resultReportedAt = { not: null };
  }

  const items = await prisma.testRequest.findMany({
    where,
    include: {
      employer: {
        select: { id: true, legalName: true, email: true }
      },
      driver: {
        select: { id: true, firstName: true, lastName: true }
      },
      clinic: true,
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: input.resultOnly
      ? [{ resultReportedAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1
  });

  const hasMore = items.length > input.limit;
  const sliced = hasMore ? items.slice(0, input.limit) : items;
  return {
    items: sliced,
    nextCursor: hasMore ? sliced[sliced.length - 1]?.id || null : null
  };
}

export async function assignClinicToRequest(input: {
  requestId: string;
  clinicId: string;
  actorUserId: string;
}) {
  const request = await prisma.testRequest.findUnique({
    where: { id: input.requestId },
    include: {
      employer: true
    }
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  if (request.reason !== "RANDOM" && !request.paid) {
    throw new Error("REQUEST_NOT_PAID");
  }

  const clinic = await prisma.clinic.findFirst({
    where: { id: input.clinicId, active: true }
  });
  if (!clinic) throw new Error("CLINIC_NOT_FOUND");

  const updated = await prisma.testRequest.update({
    where: { id: request.id },
    data: {
      clinicId: clinic.id,
      status: "SCHEDULED"
    }
  });

  const message = await sendClinicAssignmentEmail({
    to: request.employer.email,
    requestId: request.id,
    clinicName: clinic.name,
    clinicAddress: clinic.address,
    instructions: clinic.instructions
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      employerId: request.employerId,
      action: "ASSIGN_CLINIC",
      entityType: "TestRequest",
      entityId: request.id,
      metadata: {
        clinicId: clinic.id,
        messageId: message.messageId
      }
    }
  });

  return updated;
}

export async function captureTestResult(input: {
  requestId: string;
  actorUserId: string;
  resultStatus: TestResultStatus;
  collectedAt: Date;
  resultDate: Date;
  notes?: string | null;
  documents?: Array<{
    filename: string;
    contentType: string;
    data: Buffer;
  }>;
}) {
  const persisted = await prisma.$transaction(async (tx) => {
    const request = await tx.testRequest.findUnique({
      where: { id: input.requestId },
      include: {
        employer: {
          select: {
            email: true
          }
        },
        randomSelected: {
          include: {
            selectionEvent: {
              include: { randomPeriod: true }
            }
          }
        }
      }
    });
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.reason !== "RANDOM" && !request.paid) throw new Error("REQUEST_NOT_PAID");

    const updated = await tx.testRequest.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        collectedAt: input.collectedAt,
        completedAt: input.collectedAt,
        resultStatus: input.resultStatus,
        resultDate: input.resultDate,
        resultReportedAt: new Date(),
        notes: input.notes || null
      }
    });

    if (request.randomSelected) {
      await tx.randomSelectedDriver.update({
        where: { id: request.randomSelected.id },
        data: {
          status: "COMPLETED"
        }
      });
      await recalculateComplianceForPoolYear(tx, {
        poolId: request.randomSelected.selectionEvent.poolId,
        year: input.collectedAt.getUTCFullYear()
      });
    }

    const createdDocuments = [];
    for (const doc of input.documents || []) {
      const uploaded = await uploadDocumentBinary({
        buffer: doc.data,
        contentType: doc.contentType,
        filename: doc.filename,
        keyPrefix: `test-results/${request.employerId}/${request.id}`
      });
      const row = await tx.document.create({
        data: {
          employerId: request.employerId,
          entityType: "TEST_REQUEST",
          entityId: request.id,
          storageKey: uploaded.storageKey,
          filename: doc.filename,
          contentType: doc.contentType,
          retentionCategory: retentionCategoryForReason(request.reason)
        }
      });
      createdDocuments.push(row);
    }

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        employerId: request.employerId,
        action: "CAPTURE_TEST_RESULT",
        entityType: "TestRequest",
        entityId: request.id,
        metadata: {
          resultStatus: input.resultStatus,
          resultDate: input.resultDate.toISOString(),
          collectedAt: input.collectedAt.toISOString(),
          documentCount: createdDocuments.length
        }
      }
    });

    return {
      request: updated,
      documents: createdDocuments,
      employerEmail: request.employer.email
    };
  });

  const resultMessage = await sendResultPostedEmail({
    to: persisted.employerEmail,
    requestId: persisted.request.id,
    resultStatus: persisted.request.resultStatus,
    resultDate: persisted.request.resultDate || persisted.request.updatedAt
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      employerId: persisted.request.employerId,
      action: "SEND_RESULT_EMAIL",
      entityType: "TestRequest",
      entityId: persisted.request.id,
      metadata: {
        messageId: resultMessage.messageId
      }
    }
  });

  return {
    request: persisted.request,
    documents: persisted.documents
  };
}

export async function listRequestDocumentsForEmployer(input: { employerId: string; testRequestId: string }) {
  const request = await prisma.testRequest.findFirst({
    where: { id: input.testRequestId, employerId: input.employerId },
    select: { id: true }
  });
  if (!request) throw new Error("NOT_FOUND");

  return prisma.document.findMany({
    where: {
      employerId: input.employerId,
      entityType: "TEST_REQUEST",
      entityId: input.testRequestId
    },
    orderBy: { createdAt: "desc" }
  });
}
