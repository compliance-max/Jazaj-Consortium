import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { clearDatabase, testPrisma } from "./helpers/db";
import { disconnectBootstrapAdminPrisma, runBootstrapAdmin } from "../scripts/bootstrap-admin.ts";

describe("bootstrap admin", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectBootstrapAdminPrisma();
  });

  test("enabled bootstrap creates verified admin with login-ready password", async () => {
    const result = await runBootstrapAdmin({
      BOOTSTRAP_ADMIN_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: "Admin.Bootstrap@Example.com",
      BOOTSTRAP_ADMIN_PASSWORD: "Bootstrap#2026!",
      BOOTSTRAP_ADMIN_FORCE_RESET: "true"
    });

    expect(result.skipped).toBe(false);

    const user = await testPrisma.employerUser.findUnique({
      where: { email: "admin.bootstrap@example.com" }
    });

    expect(user).toBeTruthy();
    expect(user?.role).toBe("CTPA_ADMIN");
    expect(user?.employerId).toBeNull();
    expect(user?.emailVerifiedAt).toBeTruthy();
    expect(user?.disabledAt).toBeNull();
    expect(user?.passwordSetAt).toBeTruthy();
    expect(await verifyPassword("Bootstrap#2026!", user?.passwordHash || "")).toBe(true);

    const auditCount = await testPrisma.auditLog.count({
      where: {
        action: "BOOTSTRAP_ADMIN_UPSERT",
        entityId: user?.id
      }
    });
    expect(auditCount).toBe(1);
  });

  test("running bootstrap twice is idempotent and does not duplicate users", async () => {
    const env = {
      BOOTSTRAP_ADMIN_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: "idempotent.admin@example.com",
      BOOTSTRAP_ADMIN_PASSWORD: "Idempotent#2026!",
      BOOTSTRAP_ADMIN_FORCE_RESET: "false"
    };

    await runBootstrapAdmin(env);
    await runBootstrapAdmin(env);

    const users = await testPrisma.employerUser.findMany({
      where: { email: "idempotent.admin@example.com" }
    });

    expect(users).toHaveLength(1);
    expect(users[0]?.role).toBe("CTPA_ADMIN");
  });

  test("bootstrap enforces admin role (existing manager is promoted to CTPA_ADMIN)", async () => {
    const existing = await testPrisma.employerUser.create({
      data: {
        email: "manager-to-admin@example.com",
        fullName: "Manager User",
        role: "CTPA_MANAGER",
        employerId: null,
        emailVerifiedAt: null,
        passwordHash: await hashPassword("LegacyPass#2026"),
        passwordSet: true,
        passwordSetAt: new Date("2026-01-01T00:00:00.000Z")
      }
    });

    await runBootstrapAdmin({
      BOOTSTRAP_ADMIN_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: existing.email,
      BOOTSTRAP_ADMIN_PASSWORD: "Promoted#2026!",
      BOOTSTRAP_ADMIN_FORCE_RESET: "false"
    });

    const updated = await testPrisma.employerUser.findUnique({ where: { id: existing.id } });
    expect(updated?.role).toBe("CTPA_ADMIN");
    expect(updated?.employerId).toBeNull();
    expect(updated?.disabledAt).toBeNull();
  });

  test("force reset true rotates password; force reset false preserves existing password", async () => {
    const email = "force-reset-admin@example.com";

    await runBootstrapAdmin({
      BOOTSTRAP_ADMIN_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: "Initial#2026!",
      BOOTSTRAP_ADMIN_FORCE_RESET: "true"
    });

    const first = await testPrisma.employerUser.findUnique({ where: { email } });
    expect(first?.passwordHash).toBeTruthy();

    await runBootstrapAdmin({
      BOOTSTRAP_ADMIN_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: "NoChange#2027!",
      BOOTSTRAP_ADMIN_FORCE_RESET: "false"
    });

    const second = await testPrisma.employerUser.findUnique({ where: { email } });
    expect(second?.passwordHash).toBe(first?.passwordHash);
    expect(await verifyPassword("Initial#2026!", second?.passwordHash || "")).toBe(true);

    await runBootstrapAdmin({
      BOOTSTRAP_ADMIN_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: "Changed#2028!",
      BOOTSTRAP_ADMIN_FORCE_RESET: "true"
    });

    const third = await testPrisma.employerUser.findUnique({ where: { email } });
    expect(third?.passwordHash).not.toBe(second?.passwordHash);
    expect(await verifyPassword("Changed#2028!", third?.passwordHash || "")).toBe(true);
  });
});
