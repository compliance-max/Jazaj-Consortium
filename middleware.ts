import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createLogger } from "@/lib/logging/logger";
import {
  isAllowedOriginValue as isAllowedOriginValueFromConfig,
  primaryAllowedOrigin as primaryAllowedOriginFromConfig
} from "@/lib/security/origin";

const ADMIN_ROLES = new Set(["CTPA_ADMIN", "CTPA_MANAGER"]);
const PORTAL_ROLES = new Set(["EMPLOYER_DER", "READONLY_AUDITOR"]);
const STATE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE_NAME = "ctpa_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

function originConfig() {
  return {
    appUrl: process.env.APP_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    nodeEnv: process.env.NODE_ENV
  };
}

function isAllowedOriginValue(origin: string) {
  return isAllowedOriginValueFromConfig(origin, originConfig());
}

function primaryAllowedOrigin() {
  return primaryAllowedOriginFromConfig(originConfig());
}

function corsOriginForResponse(req: NextRequest) {
  const requestOrigin = extractOriginFromRequest(req);
  if (
    requestOrigin &&
    (isAllowedOriginValueFromConfig(requestOrigin, originConfig()) || requestOrigin === req.nextUrl.origin)
  ) {
    return requestOrigin;
  }
  return primaryAllowedOriginFromConfig(originConfig());
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
  // NextAuth credential/session internals may omit Origin in some deployments/proxies.
  // Keep token/password mutation routes protected, but exempt callback internals.
  if (pathname.startsWith("/api/auth/callback/")) return false;
  if (pathname === "/api/auth/signin") return false;
  if (pathname === "/api/auth/signout") return false;
  if (pathname === "/api/auth/login") return false;
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
  if (!requestOrigin) {
    const secFetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
    if (!["same-origin", "same-site", "none"].includes(secFetchSite)) return false;
    return isAllowedOriginValueFromConfig(req.nextUrl.origin, originConfig());
  }
  if (requestOrigin === req.nextUrl.origin) return true;
  return isAllowedOriginValueFromConfig(requestOrigin, originConfig());
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

function codeFromStatus(status: number) {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "BAD_REQUEST";
}

function jsonError(message: string, status: number, requestId: string, code?: string) {
  return NextResponse.json(
    {
      error: message,
      errorDetail: {
        code: code || codeFromStatus(status),
        message,
        requestId
      }
    },
    { status }
  );
}

function rejectWithLog(input: {
  logger: ReturnType<typeof createLogger>;
  requestId: string;
  req: NextRequest;
  status?: number;
  message: string;
  code?: string;
  reason: string;
  extra?: Record<string, unknown>;
}) {
  const origin = input.req.headers.get("origin");
  const referer = input.req.headers.get("referer");
  input.logger.warn(input.reason, {
    pathname: input.req.nextUrl.pathname,
    method: input.req.method,
    origin,
    referer,
    ...input.extra
  });
  const denied = jsonError(input.message, input.status || 403, input.requestId, input.code);
  denied.headers.set("x-request-id", input.requestId);
  return denied;
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
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected OPTIONS request due to disallowed origin"
      });
    }
    const response = new NextResponse(null, {
      status: 204,
      headers: corsHeaders(corsOriginForResponse(req))
    });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (isMutation(req) && isOriginProtectedPath(pathname)) {
    if (!isAllowedOrigin(req)) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected mutation due to missing/invalid origin"
      });
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
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "CSRF validation failed",
        reason: "Rejected mutation due to CSRF mismatch",
        code: "CSRF_FAILED"
      });
    }
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!token?.sub) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        status: 401,
        message: "Unauthorized",
        reason: "Rejected admin API request without session"
      });
    }
    if (token.disabledAt) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected disabled admin user"
      });
    }
    if (!token.role || !ADMIN_ROLES.has(String(token.role))) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected non-admin role on admin API"
      });
    }
  }

  if (pathname.startsWith("/api/portal/")) {
    if (!token?.sub) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        status: 401,
        message: "Unauthorized",
        reason: "Rejected portal API request without session"
      });
    }
    if (token.disabledAt) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected disabled portal user"
      });
    }
    if (!token.role || !PORTAL_ROLES.has(String(token.role))) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected non-portal role on portal API"
      });
    }
    if (!token.employerId) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected portal user without employer scope"
      });
    }
    if (!token.emailVerifiedAt) {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Unverified email",
        reason: "Rejected unverified portal user"
      });
    }
    if (isMutation(req) && token.role === "READONLY_AUDITOR") {
      return rejectWithLog({
        logger,
        requestId,
        req,
        message: "Forbidden",
        reason: "Rejected readonly auditor portal mutation"
      });
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!token?.sub) return NextResponse.redirect(new URL("/login", req.url));
    if (token.disabledAt) return jsonError("Forbidden", 403, requestId);
    if (!token.role || !ADMIN_ROLES.has(String(token.role))) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  if (pathname.startsWith("/portal")) {
    if (!token?.sub) return NextResponse.redirect(new URL("/login", req.url));
    if (token.disabledAt) return jsonError("Forbidden", 403, requestId);
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
    const headers = corsHeaders(corsOriginForResponse(req));
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
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
