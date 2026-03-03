import { beforeEach, describe, expect, test } from "vitest";
import { clearRateLimitsForTests, consumeRateLimit } from "@/lib/security/rate-limit";

describe("login rate limiting", () => {
  beforeEach(async () => {
    await clearRateLimitsForTests();
  });

  test("blocks attempts after threshold", async () => {
    const key = "driver@example.com:127.0.0.1";

    const first = await consumeRateLimit({
      namespace: "auth_login",
      key,
      limit: 2,
      windowMs: 60_000
    });
    expect(first.ok).toBe(true);

    const second = await consumeRateLimit({
      namespace: "auth_login",
      key,
      limit: 2,
      windowMs: 60_000
    });
    expect(second.ok).toBe(true);

    const third = await consumeRateLimit({
      namespace: "auth_login",
      key,
      limit: 2,
      windowMs: 60_000
    });
    expect(third.ok).toBe(false);
    expect(["redis", "memory"]).toContain(third.source);
  });
});
