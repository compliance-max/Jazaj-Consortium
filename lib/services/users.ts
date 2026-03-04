import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { validateEmployerUserInvariant } from "@/lib/auth/user-invariants";
import { createAccountToken } from "@/lib/tokens/service";
import { sendResetPasswordEmail, sendSetPasswordEmail, sendVerificationEmail } from "@/lib/email/postmark";

type Actor = {
  id: string;
  role: UserRole;
};

type ListUsersInput = {
  cursor?: string | null;
  limit: number;
  q?: string | null;
  role?: UserRole | null;
};

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] || "User";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || "Invited User";
}

function isGlobalRole(role: UserRole) {
  return role === "CTPA_ADMIN" || role === "CTPA_MANAGER";
}

function isEmployerScopedRole(role: UserRole) {
  return role === "EMPLOYER_DER" || role === "READONLY_AUDITOR";
}

function assertManagerTargetAllowed(actor: Actor, target: { employerId: string | null }) {
  if (actor.role === "CTPA_MANAGER" && !target.employerId) {
    throw new Error("FORBIDDEN");
  }
}

async function issueInviteTokensAndSendEmails(input: { userId: string; email: string }) {
  const [verifyToken, setPasswordToken] = await Promise.all([
    createAccountToken({ userId: input.userId, type: "EMAIL_VERIFICATION" }),
    createAccountToken({ userId: input.userId, type: "SET_PASSWORD" })
  ]);

  const [verifyMail, setPasswordMail] = await Promise.all([
    sendVerificationEmail({ to: input.email, token: verifyToken.raw }),
    sendSetPasswordEmail({ to: input.email, token: setPasswordToken.raw })
  ]);

  return {
    verifyMessageId: verifyMail.messageId,
    setPasswordMessageId: setPasswordMail.messageId
  };
}

export async function listAdminUsers(input: ListUsersInput) {
  const where: Prisma.EmployerUserWhereInput = {};

  if (input.role) {
    where.role = input.role;
  }

  if (input.q?.trim()) {
    const q = input.q.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { employer: { legalName: { contains: q, mode: "insensitive" } } }
    ];
  }

  const rows = await prisma.employerUser.findMany({
    where,
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      employerId: true,
      disabledAt: true,
      invitedAt: true,
      passwordSetAt: true,
      lastLoginAt: true,
      createdAt: true,
      employer: {
        select: {
          id: true,
          legalName: true
        }
      }
    },
  });

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id || null : null
  };
}

export async function listEmployerUsers(input: { employerId: string }) {
  return prisma.employerUser.findMany({
    where: {
      employerId: input.employerId,
      role: {
        in: ["EMPLOYER_DER", "READONLY_AUDITOR"]
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      employerId: true,
      disabledAt: true,
      invitedAt: true,
      passwordSetAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function createGlobalAdminUser(input: {
  actor: Actor;
  email: string;
  role: "CTPA_ADMIN" | "CTPA_MANAGER";
}) {
  if (input.actor.role !== "CTPA_ADMIN") throw new Error("FORBIDDEN");
  validateEmployerUserInvariant({ role: input.role, employerId: null });

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.employerUser.findUnique({ where: { email: input.email } });
    if (existing) throw new Error("USER_EXISTS");

    const user = await tx.employerUser.create({
      data: {
        email: input.email,
        fullName: displayNameFromEmail(input.email),
        role: input.role,
        employerId: null,
        passwordSet: false,
        invitedAt: new Date()
      }
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      employerId: user.employerId,
      invitedAt: user.invitedAt
    };
  });

  const mailResult = await issueInviteTokensAndSendEmails({
    userId: created.id,
    email: created.email
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      employerId: null,
      action: "CREATE_USER",
      entityType: "EmployerUser",
      entityId: created.id,
      metadata: {
        role: created.role,
        email: created.email,
        invitedAt: created.invitedAt?.toISOString() || null,
        ...mailResult
      }
    }
  });

  return created;
}

export async function createEmployerScopedUser(input: {
  actor: Actor;
  employerId: string;
  email: string;
  role: "EMPLOYER_DER" | "READONLY_AUDITOR";
}) {
  validateEmployerUserInvariant({ role: input.role, employerId: input.employerId });

  const created = await prisma.$transaction(async (tx) => {
    const employer = await tx.employer.findUnique({ where: { id: input.employerId } });
    if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

    const existing = await tx.employerUser.findUnique({ where: { email: input.email } });
    if (existing) throw new Error("USER_EXISTS");

    const user = await tx.employerUser.create({
      data: {
        email: input.email,
        fullName: displayNameFromEmail(input.email),
        role: input.role,
        employerId: employer.id,
        passwordSet: false,
        invitedAt: new Date()
      }
    });

    return { user, employer };
  });

  const mailResult = await issueInviteTokensAndSendEmails({
    userId: created.user.id,
    email: created.user.email
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      employerId: created.employer.id,
      action: "CREATE_EMPLOYER_USER",
      entityType: "EmployerUser",
      entityId: created.user.id,
      metadata: {
        role: created.user.role,
        email: created.user.email,
        ...mailResult
      }
    }
  });

  return created.user;
}

export async function patchUserByAdmin(input: {
  actor: Actor;
  userId: string;
  role?: UserRole;
  disabled?: boolean;
}) {
  if (input.actor.role !== "CTPA_ADMIN") throw new Error("FORBIDDEN");

  return prisma.$transaction(async (tx) => {
    const target = await tx.employerUser.findUnique({ where: { id: input.userId } });
    if (!target) throw new Error("NOT_FOUND");

    if (input.disabled === true && target.id === input.actor.id) {
      throw new Error("CANNOT_DISABLE_SELF");
    }

    const nextRole = input.role || target.role;
    const nextEmployerId = target.employerId;

    if (nextRole !== target.role) {
      if (isGlobalRole(nextRole) && target.employerId) {
        throw new Error("ROLE_TRANSITION_REQUIRES_SCOPE_CHANGE");
      }
      if (isEmployerScopedRole(nextRole) && !target.employerId) {
        throw new Error("ROLE_TRANSITION_REQUIRES_SCOPE_CHANGE");
      }
    }

    validateEmployerUserInvariant({ role: nextRole, employerId: nextEmployerId });

    const updated = await tx.employerUser.update({
      where: { id: target.id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.disabled !== undefined ? { disabledAt: input.disabled ? new Date() : null } : {})
      }
    });

    await tx.auditLog.create({
      data: {
        userId: input.actor.id,
        employerId: updated.employerId,
        action: "UPDATE_USER",
        entityType: "EmployerUser",
        entityId: updated.id,
        metadata: {
          oldRole: target.role,
          newRole: updated.role,
          oldDisabledAt: target.disabledAt?.toISOString() || null,
          newDisabledAt: updated.disabledAt?.toISOString() || null
        }
      }
    });

    return updated;
  });
}

export async function resendInvite(input: { actor: Actor; userId: string }) {
  const target = await prisma.employerUser.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      role: true,
      employerId: true
    }
  });
  if (!target) throw new Error("NOT_FOUND");

  assertManagerTargetAllowed(input.actor, target);

  const mailResult = await issueInviteTokensAndSendEmails({
    userId: target.id,
    email: target.email
  });

  const updated = await prisma.employerUser.update({
    where: { id: target.id },
    data: {
      invitedAt: new Date()
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      employerId: updated.employerId,
      action: "RESEND_USER_INVITE",
      entityType: "EmployerUser",
      entityId: updated.id,
      metadata: {
        ...mailResult
      }
    }
  });

  return updated;
}

export async function forceReset(input: { actor: Actor; userId: string }) {
  const target = await prisma.employerUser.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      employerId: true
    }
  });
  if (!target) throw new Error("NOT_FOUND");

  assertManagerTargetAllowed(input.actor, target);

  const resetToken = await createAccountToken({
    userId: target.id,
    type: "RESET_PASSWORD"
  });

  const mail = await sendResetPasswordEmail({
    to: target.email,
    token: resetToken.raw
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      employerId: target.employerId,
      action: "FORCE_RESET_USER_PASSWORD",
      entityType: "EmployerUser",
      entityId: target.id,
      metadata: {
        messageId: mail.messageId
      }
    }
  });

  return { success: true };
}
