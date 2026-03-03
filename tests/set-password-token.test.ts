import { beforeEach, describe, expect, test } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { createAccountToken } from "@/lib/tokens/service";
import { hashToken } from "@/lib/security/token";

describe("set-password token lifecycle", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test("set-password token is single-use", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "SetPass Fleet",
        address: "1 Main St",
        phone: "3130000001",
        email: "fleet-setpass@example.com"
      }
    });

    const user = await testPrisma.employerUser.create({
      data: {
        email: "setpass@example.com",
        fullName: "Set Password User",
        role: "EMPLOYER_DER",
        employerId: employer.id
      }
    });

    const token = await createAccountToken({
      userId: user.id,
      type: "SET_PASSWORD"
    });

    const { POST } = await import("@/app/api/auth/set-password/route");
    const req = () =>
      new Request("http://localhost/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.raw, password: "Complicated2026$" })
      });

    const first = await POST(req());
    expect(first.status).toBe(200);

    const second = await POST(req());
    expect(second.status).toBe(404);
  });

  test("set-password token expiry is enforced", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "SetPass Expired Fleet",
        address: "2 Main St",
        phone: "3130000002",
        email: "fleet-setpass-expired@example.com"
      }
    });

    const user = await testPrisma.employerUser.create({
      data: {
        email: "setpass-expired@example.com",
        fullName: "Expired User",
        role: "EMPLOYER_DER",
        employerId: employer.id
      }
    });

    const raw = "expired_token_value_1234567890";
    await testPrisma.accountToken.create({
      data: {
        userId: user.id,
        type: "SET_PASSWORD",
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() - 60_000)
      }
    });

    const { POST } = await import("@/app/api/auth/set-password/route");
    const response = await POST(
      new Request("http://localhost/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: raw, password: "Complicated2026$" })
      })
    );

    expect(response.status).toBe(410);
  });
});
