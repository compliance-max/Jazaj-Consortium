import { ok } from "@/lib/http";
import { prisma } from "@/lib/db/prisma";
import { getRedisClient } from "@/lib/db/redis";
import pkg from "@/package.json";
import { createLogger } from "@/lib/logging/logger";
import { configuredOrigins, parseOrigin } from "@/lib/security/origin";

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

  const appUrl = parseOrigin(process.env.APP_URL) || null;
  const nextAuthUrl = parseOrigin(process.env.NEXTAUTH_URL) || null;
  const allowedOrigins = configuredOrigins({
    appUrl: process.env.APP_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    nodeEnv: process.env.NODE_ENV
  });

  logger.info("Health check completed", { db, redis });

  return ok({
    status: db === "ok" && redis === "ok" ? "ok" : "degraded",
    time: new Date().toISOString(),
    gitSha: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
    db,
    redis,
    version: pkg.version,
    appUrl,
    nextAuthUrl,
    allowedOriginsCount: allowedOrigins.size
  });
}
