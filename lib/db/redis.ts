import Redis from "ioredis";

let redisSingleton: Redis | null | undefined;

function buildRedisClient() {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true
    });
  }

  const host = process.env.REDIS_HOST;
  if (!host) return null;

  return new Redis({
    host,
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true
  });
}

export function getRedisClient() {
  if (redisSingleton !== undefined) return redisSingleton;
  redisSingleton = buildRedisClient();
  if (redisSingleton) {
    redisSingleton.on("error", () => {
      // Keep runtime resilient; callers fall back to memory mode.
    });
  }
  return redisSingleton;
}
