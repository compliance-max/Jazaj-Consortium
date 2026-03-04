export function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function codeFromStatus(status: number) {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 410) return "GONE";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "BAD_REQUEST";
}

export function fail(
  message: string,
  status = 400,
  options?: {
    code?: string;
    requestId?: string | null;
  }
) {
  return Response.json(
    {
      // Backward-compatible error string for existing UI code paths.
      error: message,
      errorDetail: {
        code: options?.code || codeFromStatus(status),
        message,
        requestId: options?.requestId || null
      }
    },
    { status }
  );
}
