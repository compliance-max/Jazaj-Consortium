import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAccountToken } from "@/lib/tokens/service";
import { sendCertificateIssuedEmail, sendSetPasswordEmail, sendVerificationEmail } from "@/lib/email/postmark";
import { validateEmployerUserInvariant } from "@/lib/auth/user-invariants";
import { normalizeEmployerCreateInput, normalizeEmployerUpdateInput } from "@/lib/validation/employer";
import { ensureEmployerActivePool, switchEmployerPoolMode } from "@/lib/services/pools";
import { ENROLLMENT_ANNUAL_CENTS } from "@/lib/billing/pricing";
import { regenerateEnrollmentCertificate } from "@/lib/services/certificates";
import { buildDocumentDownloadUrl } from "@/lib/storage/documents";

type ListInput = {
  cursor?: string | null;
  limit: number;
  q?: string | null;
  status?: "PENDING_PAYMENT" | "ACTIVE" | "INACTIVE" | null;
};

export async function listEmployers(input: ListInput) {
  const where: Prisma.EmployerWhereInput = {};
  if (input.status) {
    where.status = input.status;
  }
  if (input.q) {
    const q = input.q.trim();
    if (q) {
      where.OR = [
        { legalName: { contains: q, mode: "insensitive" } },
        { dotNumber: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } }
      ];
    }
  }

  const items = await prisma.employer.findMany({
    where,
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    include: {
      activePool: {
        select: { id: true, type: true, dotAgency: true, cadence: true }
      },
      users: {
        where: { role: "EMPLOYER_DER" },
        select: { id: true, email: true, fullName: true, emailVerifiedAt: true, passwordSet: true }
      },
      _count: { select: { drivers: true } }
    }
  });

  const hasMore = items.length > input.limit;
  const sliced = hasMore ? items.slice(0, input.limit) : items;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id || null : null;

  return {
    items: sliced,
    nextCursor
  };
}

export async function createEmployerWithDer(raw: {
  legalName: string;
  dotNumber?: string | null;
  address: string;
  phone: string;
  email: string;
  timezone?: string;
  poolMode?: "MASTER" | "INDIVIDUAL";
  derEmail: string;
  derFullName: string;
}) {
  const input = normalizeEmployerCreateInput(raw);

  const created = await prisma.$transaction(async (tx) => {
    const employer = await tx.employer.create({
      data: {
        legalName: input.legalName,
        dotNumber: input.dotNumber,
        address: input.address,
        phone: input.phone,
        email: input.email,
        timezone: input.timezone,
        poolMode: input.poolMode,
        status: "PENDING_PAYMENT",
        renewalDueDate: null
      }
    });

    validateEmployerUserInvariant({
      role: "EMPLOYER_DER",
      employerId: employer.id
    });

    const user = await tx.employerUser.create({
      data: {
        email: input.derEmail,
        fullName: input.derFullName,
        role: "EMPLOYER_DER",
        employerId: employer.id,
        passwordSet: false,
        invitedAt: new Date()
      }
    });

    const activePool = await ensureEmployerActivePool(tx, {
      id: employer.id,
      poolMode: employer.poolMode,
      timezone: employer.timezone,
      activePoolId: employer.activePoolId
    });

    await tx.auditLog.create({
      data: {
        employerId: employer.id,
        action: "EMPLOYER_CREATED",
        entityType: "Employer",
        entityId: employer.id,
        metadata: {
          status: employer.status,
          poolMode: employer.poolMode,
          activePoolId: activePool.id
        }
      }
    });

    return { employer: { ...employer, activePoolId: activePool.id }, user };
  });

  const [verifyToken, setPasswordToken] = await Promise.all([
    createAccountToken({ userId: created.user.id, type: "EMAIL_VERIFICATION" }),
    createAccountToken({ userId: created.user.id, type: "SET_PASSWORD" })
  ]);

  await Promise.all([
    sendVerificationEmail({ to: created.user.email, token: verifyToken.raw }),
    sendSetPasswordEmail({ to: created.user.email, token: setPasswordToken.raw })
  ]);

  return created;
}

export async function getEmployerDetail(id: string) {
  const [employer, driverMembershipHistory] = await prisma.$transaction([
    prisma.employer.findUnique({
      where: { id },
      include: {
        activePool: {
          select: { id: true, type: true, dotAgency: true, cadence: true, timezone: true }
        },
        users: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            employerId: true,
            emailVerifiedAt: true,
            passwordSet: true,
            disabledAt: true,
            invitedAt: true,
            passwordSetAt: true,
            lastLoginAt: true,
            createdAt: true
          }
        },
        drivers: {
          orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
          include: {
            currentPool: {
              select: { id: true, type: true, dotAgency: true, cadence: true }
            }
          }
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10
        },
        certificates: {
          orderBy: { createdAt: "desc" },
          include: {
            document: {
              select: {
                id: true,
                filename: true
              }
            }
          }
        },
        testRequests: {
          orderBy: { createdAt: "desc" },
          take: 25,
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            clinic: true
          }
        }
      }
    }),
    prisma.driverPoolMembership.findMany({
      where: {
        driver: {
          employerId: id
        }
      },
      orderBy: [{ effectiveStart: "desc" }],
      take: 20,
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        pool: {
          select: {
            id: true,
            type: true,
            dotAgency: true,
            cadence: true
          }
        },
        changedByUser: {
          select: {
            id: true,
            email: true
          }
        }
      }
    })
  ]);

  if (!employer) return null;
  return {
    ...employer,
    driverMembershipHistory
  };
}

export async function updateEmployer(
  id: string,
  raw: Parameters<typeof normalizeEmployerUpdateInput>[0],
  changedByUserId?: string | null
) {
  const input = normalizeEmployerUpdateInput(raw);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.employer.findUnique({
      where: { id }
    });
    if (!existing) throw new Error("EMPLOYER_NOT_FOUND");
    if (input.status === "ACTIVE" && existing.status !== "ACTIVE") {
      throw new Error("ACTIVE_STATUS_REQUIRES_ACTIVATION");
    }

    const targetPoolMode = input.poolMode || existing.poolMode;
    let migrationSummary = {
      movedDrivers: 0,
      closedMemberships: 0,
      createdMemberships: 0
    };
    let resolvedPoolId = existing.activePoolId;

    if (targetPoolMode !== existing.poolMode) {
      const switched = await switchEmployerPoolMode(tx, {
        employerId: existing.id,
        newPoolMode: targetPoolMode,
        migrateDrivers: input.migrateDrivers,
        changedByUserId
      });
      resolvedPoolId = switched.targetPool.id;
      migrationSummary = switched.summary;
    } else {
      const ensuredPool = await ensureEmployerActivePool(tx, {
        id: existing.id,
        poolMode: targetPoolMode,
        timezone: input.timezone || existing.timezone,
        activePoolId: existing.activePoolId
      });
      resolvedPoolId = ensuredPool.id;
    }

    const employer = await tx.employer.update({
      where: { id },
      data: {
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.dotNumber !== undefined ? { dotNumber: input.dotNumber } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        poolMode: targetPoolMode,
        activePoolId: resolvedPoolId || null
      },
      include: {
        activePool: {
          select: { id: true, type: true, dotAgency: true, cadence: true, timezone: true }
        }
      }
    });

    await tx.auditLog.create({
      data: {
        userId: changedByUserId || null,
        employerId: employer.id,
        action: "EMPLOYER_UPDATED",
        entityType: "Employer",
        entityId: employer.id,
        metadata: {
          status: employer.status,
          poolMode: employer.poolMode,
          migrationSummary
        }
      }
    });

    return { employer, migrationSummary };
  });
}

function addOneYear(input: Date) {
  const next = new Date(input);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function manualEnrollmentStripeSessionId(input: {
  employerId: string;
  method: "MANUAL" | "INVOICE" | "COMP";
}) {
  const suffix = crypto.randomBytes(6).toString("hex");
  return `manual-${input.method.toLowerCase()}-${input.employerId}-${Date.now()}-${suffix}`;
}

export async function activateEmployerByAdmin(input: {
  employerId: string;
  actorUserId: string;
  method: "MANUAL" | "INVOICE" | "COMP";
  overrideReason: string;
}) {
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const employer = await tx.employer.findUnique({
      where: { id: input.employerId }
    });
    if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

    const baseDate = employer.renewalDueDate && employer.renewalDueDate > now ? employer.renewalDueDate : now;
    const renewalDueDate = addOneYear(baseDate);

    const payment = await tx.payment.create({
      data: {
        employerId: employer.id,
        type: "ENROLLMENT",
        amountCents: ENROLLMENT_ANNUAL_CENTS,
        status: "PAID",
        method: input.method,
        reference: input.overrideReason,
        paidAt: now,
        stripeSessionId: manualEnrollmentStripeSessionId({
          employerId: employer.id,
          method: input.method
        })
      }
    });

    const nextEmployer = await tx.employer.update({
      where: { id: employer.id },
      data: {
        status: "ACTIVE",
        renewalDueDate
      }
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        employerId: employer.id,
        action: "EMPLOYER_ACTIVATED_OVERRIDE",
        entityType: "Employer",
        entityId: employer.id,
        metadata: {
          method: input.method,
          overrideReason: input.overrideReason,
          paymentId: payment.id,
          previousStatus: employer.status,
          nextStatus: nextEmployer.status,
          renewalDueDate: renewalDueDate.toISOString()
        }
      }
    });

    return { employer: nextEmployer, payment };
  });

  const cert = await regenerateEnrollmentCertificate({
    employerId: input.employerId,
    actorUserId: input.actorUserId
  });

  const certificateUrl = await buildDocumentDownloadUrl({
    storageKey: cert.document.storageKey,
    filename: cert.document.filename,
    contentType: cert.document.contentType
  });

  const certificateMessage = await sendCertificateIssuedEmail({
    to: updated.employer.email,
    legalName: updated.employer.legalName,
    certificateId: cert.certificate.id,
    certificateUrl
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      employerId: updated.employer.id,
      action: "SEND_CERTIFICATE_EMAIL",
      entityType: "EnrollmentCertificate",
      entityId: cert.certificate.id,
      metadata: {
        messageId: certificateMessage.messageId,
        to: updated.employer.email
      }
    }
  });

  return {
    employer: updated.employer,
    payment: updated.payment,
    certificate: cert.certificate
  };
}
