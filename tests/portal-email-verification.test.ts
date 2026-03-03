import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const getTokenMock = vi.fn();

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock
}));

describe("portal email verification gate", () => {
  test("blocks unverified users from portal routes", async () => {
    const { middleware } = await import("@/middleware");
    getTokenMock.mockResolvedValue({
      sub: "user-1",
      role: "EMPLOYER_DER",
      employerId: "emp-1",
      emailVerifiedAt: null
    });

    const req = new NextRequest("http://localhost:3000/portal");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/verify-email?required=1");
  });

  test("allows verified portal users", async () => {
    const { middleware } = await import("@/middleware");
    getTokenMock.mockResolvedValue({
      sub: "user-1",
      role: "EMPLOYER_DER",
      employerId: "emp-1",
      emailVerifiedAt: new Date().toISOString()
    });

    const req = new NextRequest("http://localhost:3000/portal");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });
});
