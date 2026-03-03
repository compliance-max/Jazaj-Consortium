import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createLogger } from "@/lib/logging/logger";

const ADMIN_ROLES = new Set(["CTPA_ADMIN", "CTPA_MANAGER"]);
const PORTAL_ROLES = new Set(["EMPLOYER_DER"]);
const STATE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE_NAME = "ctpa_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

function parseOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function configuredOrigins() {
  const configured = new Set<string>();
  const appOrigin = parseOrigin(process.env.APP_URL);
  const nextAuthOrigin = parseOrigin(process.env.NEXTAUTH_URL);
  if (appOrigin) configured.add(appOrigin);
  if (nextAuthOrigin) configured.add(nextAuthOrigin);
  if (!appOrigin && !nextAuthOrigin) {
    configured.add("http://localhost:3000");
  }
  return configured;
}

function isAllowedDevLocalOrigin(origin: string) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  const url = new URL(parsed);
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

function isAllowedOriginValue(origin: string) {
  const configured = configuredOrigins();
  if (configured.has(origin)) return true;
  if (!isProduction() && isAllowedDevLocalOrigin(origin)) return true;
  return false;
}

function primaryAllowedOrigin() {
  const appOrigin = parseOrigin(process.env.APP_URL);
  if (appOrigin) return appOrigin;
  const nextAuthOrigin = parseOrigin(process.env.NEXTAUTH_URL);
  if (nextAuthOrigin) return nextAuthOrigin;
  return "http://localhost:3000";
}

function corsOriginForResponse(req: NextRequest) {
  if (isProduction()) {
    return primaryAllowedOrigin();
  }
  const requestOrigin = extractOriginFromRequest(req);
  if (requestOrigin && isAllowedOriginValue(requestOrigin)) {
    return requestOrigin;
  }
  return primaryAllowedOrigin();
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isMutation(req: NextRequest) {
  return STATE_METHODS.has(req.method.toUpperCase());
}

function isOriginProtectedPath(pathname: string) {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/stripe/webhook") return false;
  if (pathname.startsWith("/api/internal/")) return false;
  return true;
}

function extractOriginFromRequest(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(req: NextRequest) {
  const requestOrigin = extractOriginFromRequest(req);
  if (!requestOrigin) return false;
  return isAllowedOriginValue(requestOrigin);
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token, X-Internal-Job-Token, X-Internal-Job-Scope",
    Vary: "Origin"
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({
    requestId,
    method: req.method,
    route: req.nextUrl.pathname
  });
  const pathname = req.nextUrl.pathname;
  const token = await getToken({ req, secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET });
  const isApi = isApiPath(pathname);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  if (isApi && req.method === "OPTIONS") {
    if (!isAllowedOrigin(req)) {
      const denied = jsonError("Forbidden", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
    const response = new NextResponse(null, {
      status: 204,
      headers: corsHeaders(corsOriginForResponse(req))
    });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (isApi) {
    const origin = extractOriginFromRequest(req);
    if (origin && !isAllowedOriginValue(origin)) {
      logger.warn("Rejected API request due to disallowed origin", { origin });
      const denied = jsonError("Forbidden", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
  }

  if (isMutation(req) && isOriginProtectedPath(pathname)) {
    if (!isAllowedOrigin(req)) {
      logger.warn("Rejected mutation due to missing/invalid origin");
      const denied = jsonError("Forbidden", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
  }

  if (
    isMutation(req) &&
    (pathname.startsWith("/api/admin/") ||
      pathname.startsWith("/api/portal/") ||
      pathname === "/api/chat/message" ||
      pathname === "/api/chat/start")
  ) {
    const csrfCookie = req.cookies.get(CSRF_COOKIE_NAME)?.value || "";
    const csrfHeader = req.headers.get(CSRF_HEADER_NAME) || "";
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      logger.warn("Rejected mutation due to CSRF mismatch");
      const denied = jsonError("CSRF validation failed", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!token?.sub) {
      const denied = jsonError("Unauthorized", 401);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
    if (!token.role || !ADMIN_ROLES.has(String(token.role))) {
      const denied = jsonError("Forbidden", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
  }

  if (pathname.startsWith("/api/portal/")) {
    if (!token?.sub) {
      const denied = jsonError("Unauthorized", 401);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
    if (!token.role || !PORTAL_ROLES.has(String(token.role))) {
      const denied = jsonError("Forbidden", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
    if (!token.employerId) {
      const denied = jsonError("Forbidden", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
    if (!token.emailVerifiedAt) {
      const denied = jsonError("Unverified email", 403);
      denied.headers.set("x-request-id", requestId);
      return denied;
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!token?.sub) return NextResponse.redirect(new URL("/login", req.url));
    if (!token.role || !ADMIN_ROLES.has(String(token.role))) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  if (pathname.startsWith("/portal")) {
    if (!token?.sub) return NextResponse.redirect(new URL("/login", req.url));
    if (!token.role || !PORTAL_ROLES.has(String(token.role))) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    if (!token.employerId) return NextResponse.redirect(new URL("/admin", req.url));
    if (!token.emailVerifiedAt) {
      return NextResponse.redirect(new URL("/verify-email?required=1", req.url));
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set("x-request-id", requestId);
  if (isApi) {
    const origin = extractOriginFromRequest(req);
    if (origin && isAllowedOriginValue(origin)) {
      const headers = corsHeaders(corsOriginForResponse(req));
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
    }
  }

  const isPageGet = !isApi && req.method === "GET";
  if (isPageGet && !req.cookies.get(CSRF_COOKIE_NAME)?.value) {
    response.cookies.set(CSRF_COOKIE_NAME, crypto.randomUUID(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
