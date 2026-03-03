export function getCsrfTokenFromCookie() {
  if (typeof document === "undefined") return "";
  const pairs = document.cookie.split(";").map((entry) => entry.trim());
  const target = pairs.find((entry) => entry.startsWith("ctpa_csrf="));
  if (!target) return "";
  return decodeURIComponent(target.split("=").slice(1).join("="));
}

export function withCsrfHeaders(base?: HeadersInit) {
  const token = getCsrfTokenFromCookie();
  const headers = new Headers(base || {});
  if (token) {
    headers.set("x-csrf-token", token);
  }
  return headers;
}
