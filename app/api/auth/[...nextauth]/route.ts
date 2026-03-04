import { handlers } from "@/auth";
import { createLogger } from "@/lib/logging/logger";
import { NextRequest } from "next/server";

type NextAuthRouteContext = {
  params?: {
    nextauth?: string[];
  };
};

export async function GET(req: NextRequest, context: NextAuthRouteContext) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({
    requestId,
    route: "/api/auth/[...nextauth]",
    method: "GET"
  });
  try {
    return await handlers.GET(req);
  } catch (error) {
    logger.error("NextAuth GET handler failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      action: context?.params?.nextauth?.join("/") || null,
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer")
    });
    return Response.json({ error: "Auth route failed", requestId }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: NextAuthRouteContext) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({
    requestId,
    route: "/api/auth/[...nextauth]",
    method: "POST"
  });
  try {
    return await handlers.POST(req);
  } catch (error) {
    logger.error("NextAuth POST handler failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      action: context?.params?.nextauth?.join("/") || null,
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer")
    });
    return Response.json({ error: "Auth route failed", requestId }, { status: 500 });
  }
}
