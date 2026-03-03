const INTERNAL_ROUTE_SCOPES: Record<string, string> = {
  "/api/internal/jobs/run-random": "jobs:random_run",
  "/api/internal/jobs/quarter-end-review": "jobs:quarter_review",
  "/api/internal/jobs/retention-candidates": "jobs:retention_scan"
};

export function isInternalJobAuthorized(req: Request, routePath: string) {
  const token = process.env.INTERNAL_JOB_TOKEN;
  if (!token) return false;

  const configuredScope = INTERNAL_ROUTE_SCOPES[routePath];
  if (!configuredScope) return false;

  const headerToken =
    req.headers.get("x-internal-job-token") ||
    req.headers.get("x-job-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const scope = req.headers.get("x-internal-job-scope");
  return Boolean(headerToken && headerToken === token && scope === configuredScope);
}

export function requiredInternalJobScope(routePath: string) {
  return INTERNAL_ROUTE_SCOPES[routePath] || null;
}
