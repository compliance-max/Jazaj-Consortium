import { ok } from "@/lib/http";
import { prisma } from "@/lib/db/prisma";
import { getRedisClient } from "@/lib/db/redis";
import pkg from "@/package.json";
import { createLogger } from "@/lib/logging/logger";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({ requestId, route: "/api/health", method: "GET" });
  let db = "ok";
  let redis = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
    logger.error("Health check DB ping failed");
  }

  try {
    const client = getRedisClient();
    if (client) {
      if (client.status !== "ready") await client.connect();
      await client.ping();
    }
  } catch {
    redis = "error";
    logger.error("Health check Redis ping failed");
  }

  logger.info("Health check completed", { db, redis });

  return ok({
    status: db === "ok" && redis === "ok" ? "ok" : "degraded",
    time: new Date().toISOString(),
    gitSha: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
    db,
    redis,
    version: pkg.version
  });
}
