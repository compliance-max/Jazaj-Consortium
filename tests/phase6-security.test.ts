import { describe, expect, test, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isInternalJobAuthorized } from "@/lib/auth/internal-job";

const { getTokenMock, runRandomSelectionsMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  runRandomSelectionsMock: vi.fn(async () => ({ commit: true, results: [] }))
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock
}));

vi.mock("@/lib/services/random/engine", () => ({
  runRandomSelections: runRandomSelectionsMock,
  sendQuarterEndRosterReviewReminders: vi.fn(async () => ({ sentCount: 0 }))
}));

describe("Phase 6 security middleware and internal job token scope", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    getTokenMock.mockReset();
    runRandomSelectionsMock.mockClear();
    process.env.APP_URL = "http://localhost:3000";
    process.env.INTERNAL_JOB_TOKEN = "internal-phase6-token";
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("middleware blocks invalid origin for mutation routes", async () => {
    getTokenMock.mockResolvedValue({
      sub: "admin-1",
      role: "CTPA_ADMIN"
    });
    const request = new NextRequest("http://localhost:3000/api/admin/chat/close", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        cookie: "ctpa_csrf=token-a",
        "x-csrf-token": "token-a"
      }
    });

    const response = await middleware(request);
    expect(response.status).toBe(403);
  });

  test("production mode rejects localhost:3001 when APP_URL is localhost:3000", async () => {
    process.env.NODE_ENV = "production";
    getTokenMock.mockResolvedValue({
      sub: "admin-prod",
      role: "CTPA_ADMIN"
    });

    const request = new NextRequest("http://localhost:3000/api/admin/chat/close", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        cookie: "ctpa_csrf=prod-token",
        "x-csrf-token": "prod-token"
      }
    });

    const response = await middleware(request);
    expect(response.status).toBe(403);
  });

  test("development mode allows localhost:3001 when APP_URL is localhost:3000", async () => {
    process.env.NODE_ENV = "development";
    getTokenMock.mockResolvedValue({
      sub: "admin-dev",
      role: "CTPA_ADMIN"
    });

    const request = new NextRequest("http://localhost:3000/api/admin/chat/close", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        cookie: "ctpa_csrf=dev-token",
        "x-csrf-token": "dev-token"
      }
    });

    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  test("middleware blocks CSRF mismatch on portal mutations", async () => {
    getTokenMock.mockResolvedValue({
      sub: "der-1",
      role: "EMPLOYER_DER",
      employerId: "emp-1",
      emailVerifiedAt: new Date().toISOString()
    });
    const request = new NextRequest("http://localhost:3000/api/portal/drivers", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "ctpa_csrf=token-a",
        "x-csrf-token": "token-b"
      }
    });

    const response = await middleware(request);
    expect(response.status).toBe(403);
  });

  test("middleware allows valid origin and CSRF on portal mutations", async () => {
    getTokenMock.mockResolvedValue({
      sub: "der-2",
      role: "EMPLOYER_DER",
      employerId: "emp-2",
      emailVerifiedAt: new Date().toISOString()
    });
    const request = new NextRequest("http://localhost:3000/api/portal/drivers", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "ctpa_csrf=token-ok",
        "x-csrf-token": "token-ok"
      }
    });

    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  test("POST /api/chat/message requires CSRF and allows valid CSRF", async () => {
    getTokenMock.mockResolvedValue(null);

    const missingCsrf = new NextRequest("http://localhost:3000/api/chat/message", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000"
      }
    });
    const denied = await middleware(missingCsrf);
    expect(denied.status).toBe(403);

    const validCsrf = new NextRequest("http://localhost:3000/api/chat/message", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "ctpa_csrf=chat-token",
        "x-csrf-token": "chat-token"
      }
    });
    const allowed = await middleware(validCsrf);
    expect(allowed.status).toBe(200);
  });

  test("internal token scope allows only intended routes", async () => {
    const allowed = new Request("http://localhost:3000/api/internal/jobs/run-random", {
      method: "POST",
      headers: {
        "x-internal-job-token": "internal-phase6-token",
        "x-internal-job-scope": "jobs:random_run"
      }
    });
    const wrongScope = new Request("http://localhost:3000/api/internal/jobs/run-random", {
      method: "POST",
      headers: {
        "x-internal-job-token": "internal-phase6-token",
        "x-internal-job-scope": "jobs:quarter_review"
      }
    });

    expect(isInternalJobAuthorized(allowed, "/api/internal/jobs/run-random")).toBe(true);
    expect(isInternalJobAuthorized(wrongScope, "/api/internal/jobs/run-random")).toBe(false);
    expect(isInternalJobAuthorized(allowed, "/api/internal/jobs/not-allowed")).toBe(false);
  });

  test("internal run-random route enforces token and scope", async () => {
    const { POST } = await import("@/app/api/internal/jobs/run-random/route");

    const denied = await POST(
      new Request("http://localhost:3000/api/internal/jobs/run-random", {
        method: "POST",
        headers: {
          "x-internal-job-token": "internal-phase6-token",
          "x-internal-job-scope": "jobs:quarter_review"
        }
      })
    );
    expect(denied.status).toBe(404);

    const allowed = await POST(
      new Request("http://localhost:3000/api/internal/jobs/run-random", {
        method: "POST",
        headers: {
          "x-internal-job-token": "internal-phase6-token",
          "x-internal-job-scope": "jobs:random_run"
        }
      })
    );
    expect(allowed.status).toBe(200);
    expect(runRandomSelectionsMock).toHaveBeenCalledTimes(1);
  });
});
