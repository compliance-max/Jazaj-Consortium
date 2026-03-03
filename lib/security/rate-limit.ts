import { getRedisClient } from "@/lib/db/redis";

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, MemoryBucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  source: "redis" | "memory";
};

type ConsumeInput = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

function memoryConsume(input: ConsumeInput): RateLimitResult {
  const now = Date.now();
  const scoped = `rl:${input.namespace}:${input.key}`;
  const current = memoryStore.get(scoped);

  if (!current || current.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + input.windowMs };
    memoryStore.set(scoped, bucket);
    return { ok: true, remaining: input.limit - 1, resetAt: bucket.resetAt, source: "memory" };
  }

  const next = current.count + 1;
  if (next > input.limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt, source: "memory" };
  }

  current.count = next;
  memoryStore.set(scoped, current);
  return { ok: true, remaining: input.limit - next, resetAt: current.resetAt, source: "memory" };
}

async function redisConsume(input: ConsumeInput): Promise<RateLimitResult | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    if (redis.status !== "ready") await redis.connect();
    const scoped = `rl:${input.namespace}:${input.key}`;
    const now = Date.now();

    const [ok, remaining, resetAt] = (await redis.eval(
      `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local nowms = tonumber(ARGV[3])

      local current = redis.call("GET", key)
      if not current then
        redis.call("SET", key, 1, "PX", window)
        return {1, limit - 1, nowms + window}
      end

      current = tonumber(current)
      if current + 1 > limit then
        local ttl = redis.call("PTTL", key)
        if ttl < 0 then ttl = window end
        return {0, 0, nowms + ttl}
      end

      local value = redis.call("INCR", key)
      local ttl = redis.call("PTTL", key)
      if ttl < 0 then
        redis.call("PEXPIRE", key, window)
        ttl = window
      end

      return {1, limit - value, nowms + ttl}
    `,
      1,
      scoped,
      input.limit,
      input.windowMs,
      now
    )) as [number, number, number];

    return {
      ok: ok === 1,
      remaining: Number(remaining),
      resetAt: Number(resetAt),
      source: "redis"
    };
  } catch {
    return null;
  }
}

export async function consumeRateLimit(input: ConsumeInput): Promise<RateLimitResult> {
  const redisResult = await redisConsume(input);
  if (redisResult) return redisResult;
  return memoryConsume(input);
}

export async function clearRateLimitsForTests() {
  memoryStore.clear();
  const redis = getRedisClient();
  if (!redis) return;
  try {
    if (redis.status !== "ready") await redis.connect();
    const keys = await redis.keys("rl:*");
    if (keys.length) await redis.del(keys);
  } catch {
    // ignore cleanup failures in tests
  }
}
