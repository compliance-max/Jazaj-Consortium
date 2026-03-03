import { EmployerStatus, UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole, isPortalRole } from "@/lib/auth/roles";

export async function requireSessionUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user;
}

export async function requireRole(allowed: UserRole[]) {
  const user = await requireSessionUser();
  if (!allowed.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireAdminOrManager() {
  const user = await requireSessionUser();
  if (!isAdminRole(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requirePortalContext() {
  const user = await requireSessionUser();

  if (!isPortalRole(user.role)) {
    throw new Error("FORBIDDEN");
  }
  if (!user.employerId) {
    throw new Error("FORBIDDEN");
  }
  if (!user.emailVerifiedAt) {
    throw new Error("UNVERIFIED");
  }

  const employer = await prisma.employer.findUnique({
    where: { id: user.employerId }
  });
  if (!employer) {
    throw new Error("FORBIDDEN");
  }

  return { user, employer };
}

export function ensureEmployerActiveForMutation(status: EmployerStatus) {
  if (status !== "ACTIVE") {
    throw new Error("EMPLOYER_INACTIVE");
  }
}
