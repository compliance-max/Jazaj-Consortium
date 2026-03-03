import { beforeEach, describe, expect, test } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { createAccountToken } from "@/lib/tokens/service";
import { hashToken } from "@/lib/security/token";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("reset-password token lifecycle", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test("reset-password token is single-use", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Reset Fleet",
        address: "11 Main St",
        phone: "3131111111",
        email: "fleet-reset@example.com"
      }
    });

    const user = await testPrisma.employerUser.create({
      data: {
        email: "reset@example.com",
        fullName: "Reset User",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        passwordHash: await hashPassword("OriginalPass1$"),
        passwordSet: true
      }
    });

    const token = await createAccountToken({
      userId: user.id,
      type: "RESET_PASSWORD"
    });

    const { POST } = await import("@/app/api/auth/reset-password/route");
    const req = () =>
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.raw, password: "UpdatedPass1$" })
      });

    const first = await POST(req());
    expect(first.status).toBe(200);

    const second = await POST(req());
    expect(second.status).toBe(404);

    const updated = await testPrisma.employerUser.findUniqueOrThrow({
      where: { id: user.id }
    });
    expect(updated.passwordHash).toBeTruthy();
    expect(await verifyPassword("UpdatedPass1$", updated.passwordHash || "")).toBe(true);
  });

  test("reset-password token expiry is enforced", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Reset Expired Fleet",
        address: "12 Main St",
        phone: "3131111112",
        email: "fleet-reset-expired@example.com"
      }
    });

    const user = await testPrisma.employerUser.create({
      data: {
        email: "reset-expired@example.com",
        fullName: "Expired Reset User",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        passwordHash: await hashPassword("OriginalPass1$")
      }
    });

    const raw = "expired_reset_token_1234567890";
    await testPrisma.accountToken.create({
      data: {
        userId: user.id,
        type: "RESET_PASSWORD",
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() - 60_000)
      }
    });

    const { POST } = await import("@/app/api/auth/reset-password/route");
    const response = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: raw, password: "UpdatedPass1$" })
      })
    );

    expect(response.status).toBe(410);
  });
});
