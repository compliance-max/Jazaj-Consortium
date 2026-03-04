import { parseOrigin } from "@/lib/security/origin";

type EnvValidation = {
  ok: boolean;
  missing: string[];
  invalid: string[];
  keys: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var __envValidationLoggedOnce: boolean | undefined;
}

export function getAuthSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "";
}

function isProductionBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

export function validateProductionEnv(): EnvValidation {
  if (process.env.NODE_ENV !== "production" || isProductionBuildPhase()) {
    return { ok: true, missing: [], invalid: [], keys: [] };
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  const appOrigin = parseOrigin(process.env.APP_URL);
  const nextAuthOrigin = parseOrigin(process.env.NEXTAUTH_URL);
  const nextAuthSecret = (process.env.NEXTAUTH_SECRET || "").trim();
  const authSecret = (process.env.AUTH_SECRET || "").trim();
  const databaseUrl = (process.env.DATABASE_URL || "").trim();

  if (!appOrigin) {
    missing.push("APP_URL");
  } else if (!appOrigin.startsWith("https://")) {
    invalid.push("APP_URL");
  }

  if (!nextAuthOrigin) {
    missing.push("NEXTAUTH_URL");
  } else if (!nextAuthOrigin.startsWith("https://")) {
    invalid.push("NEXTAUTH_URL");
  }

  if (appOrigin && nextAuthOrigin && appOrigin !== nextAuthOrigin) {
    invalid.push("APP_URL");
    invalid.push("NEXTAUTH_URL");
  }

  if (!nextAuthSecret) {
    missing.push("NEXTAUTH_SECRET");
  } else if (nextAuthSecret.length < 32) {
    invalid.push("NEXTAUTH_SECRET");
  }

  if (!databaseUrl) {
    missing.push("DATABASE_URL");
  }

  if (authSecret && nextAuthSecret && authSecret !== nextAuthSecret) {
    invalid.push("AUTH_SECRET");
  }

  const keys = [...missing, ...invalid];
  return {
    ok: keys.length === 0,
    missing,
    invalid,
    keys
  };
}

export function logEnvValidationOnce() {
  const validation = validateProductionEnv();
  if (!validation.ok && !globalThis.__envValidationLoggedOnce) {
    globalThis.__envValidationLoggedOnce = true;
    console.error(`ENV_MISSING: ${validation.keys.join(",")}`);
  }
  return validation;
}

export function assertProductionEnv() {
  const validation = logEnvValidationOnce();
  if (!validation.ok && process.env.NODE_ENV === "production") {
    throw new Error(`ENV_MISSING: ${validation.keys.join(",")}`);
  }
}
