type OriginConfigInput = {
  appUrl?: string | null;
  nextAuthUrl?: string | null;
  allowedOrigins?: string | null;
  nodeEnv?: string | null;
};

export function parseOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isProduction(nodeEnv?: string | null) {
  return nodeEnv === "production";
}

function parseAllowedOriginsList(value?: string | null) {
  if (!value) return [] as string[];
  return value
    .split(",")
    .map((part) => parseOrigin(part.trim()))
    .filter((part): part is string => Boolean(part));
}

function addRootAndWwwVariants(set: Set<string>, origin: string) {
  set.add(origin);
  try {
    const url = new URL(origin);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      set.add(url.origin);
    } else {
      url.hostname = `www.${url.hostname}`;
      set.add(url.origin);
    }
  } catch {
    // ignore malformed variants
  }
}

export function configuredOrigins(input: OriginConfigInput) {
  const configured = new Set<string>();
  const baseOrigins = [
    parseOrigin(input.appUrl),
    parseOrigin(input.nextAuthUrl),
    ...parseAllowedOriginsList(input.allowedOrigins)
  ];

  for (const origin of baseOrigins) {
    if (!origin) continue;
    addRootAndWwwVariants(configured, origin);
  }

  if (!isProduction(input.nodeEnv) && configured.size === 0) {
    configured.add("http://localhost:3000");
    configured.add("http://127.0.0.1:3000");
  }

  return configured;
}

export function isAllowedDevLocalOrigin(origin: string) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  const url = new URL(parsed);
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export function isAllowedOriginValue(
  origin: string,
  input: OriginConfigInput
) {
  const configured = configuredOrigins(input);
  if (configured.has(origin)) return true;
  if (!isProduction(input.nodeEnv) && isAllowedDevLocalOrigin(origin)) return true;
  return false;
}

export function primaryAllowedOrigin(input: OriginConfigInput) {
  const appOrigin = parseOrigin(input.appUrl);
  if (appOrigin) return appOrigin;
  const nextAuthOrigin = parseOrigin(input.nextAuthUrl);
  if (nextAuthOrigin) return nextAuthOrigin;
  if (!isProduction(input.nodeEnv)) return "http://localhost:3000";
  return "";
}

