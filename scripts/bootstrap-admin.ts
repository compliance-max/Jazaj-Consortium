import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/security/password";

const prisma = new PrismaClient();

type BootstrapEnv = {
  BOOTSTRAP_ADMIN_ENABLED?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  BOOTSTRAP_ADMIN_FORCE_RESET?: string;
};

function boolFromEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function ensureRequired(input: string | undefined, key: string) {
  const value = (input || "").trim();
  if (!value) {
    throw new Error(`${key} is required when BOOTSTRAP_ADMIN_ENABLED=true`);
  }
  return value;
}

function buildUserName(email: string) {
  const local = email.split("@")[0] || "CTPA Admin";
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "CTPA Admin"
  );
}

export async function runBootstrapAdmin(env: BootstrapEnv | NodeJS.ProcessEnv = process.env) {
  const enabled = boolFromEnv(env.BOOTSTRAP_ADMIN_ENABLED, false);
  if (!enabled) {
    return {
      skipped: true,
      reason: "BOOTSTRAP_ADMIN_ENABLED is not true"
    } as const;
  }

  const email = ensureRequired(env.BOOTSTRAP_ADMIN_EMAIL, "BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = ensureRequired(env.BOOTSTRAP_ADMIN_PASSWORD, "BOOTSTRAP_ADMIN_PASSWORD");
  if (password.length < 10) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters");
  }

  const forceReset = boolFromEnv(env.BOOTSTRAP_ADMIN_FORCE_RESET, true);
  const now = new Date();

  const existing = await prisma.employerUser.findUnique({
    where: { email },
    select: {
      id: true,
      fullName: true,
      passwordHash: true,
      passwordSet: true,
      passwordSetAt: true
    }
  });

  const shouldSetPassword = forceReset || !existing?.passwordSetAt;
  const passwordHash = shouldSetPassword
    ? await hashPassword(password)
    : existing?.passwordHash || (await hashPassword(password));

  const user = await prisma.employerUser.upsert({
    where: { email },
    update: {
      fullName: existing?.fullName || buildUserName(email),
      role: "CTPA_ADMIN",
      employerId: null,
      emailVerifiedAt: now,
      disabledAt: null,
      passwordHash,
      passwordSet: true,
      ...(shouldSetPassword ? { passwordSetAt: now } : {})
    },
    create: {
      email,
      fullName: buildUserName(email),
      role: "CTPA_ADMIN",
      employerId: null,
      emailVerifiedAt: now,
      disabledAt: null,
      passwordHash,
      passwordSet: true,
      passwordSetAt: now,
      invitedAt: now
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      employerId: null,
      action: "BOOTSTRAP_ADMIN_UPSERT",
      entityType: "EmployerUser",
      entityId: user.id,
      metadata: {
        email: user.email,
        forceReset,
        shouldSetPassword,
        timestamp: now.toISOString()
      }
    }
  });

  return {
    skipped: false,
    userId: user.id,
    email: user.email,
    forceReset,
    shouldSetPassword
  } as const;
}

export async function main() {
  const result = await runBootstrapAdmin(process.env);
  if (result.skipped) {
    console.log("BOOTSTRAP_ADMIN_SKIPPED");
    return;
  }

  console.log("BOOTSTRAP_ADMIN_OK");
}

export async function disconnectBootstrapAdminPrisma() {
  await prisma.$disconnect();
}

async function runAsCli() {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap-admin error";
    console.error(message);
    process.exitCode = 1;
  } finally {
    await disconnectBootstrapAdminPrisma();
  }
}

if (process.argv[1]?.includes("bootstrap-admin")) {
  void runAsCli();
}
