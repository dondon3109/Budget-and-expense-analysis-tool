export const CACHE_VERSION = "zoption-pwa-v4";
export const STATIC_CACHE_NAME = `${CACHE_VERSION}-static`;

export const PRECACHE_URLS = Object.freeze([
  "/manifest.webmanifest",
  "/brand/zoption-pwa-192.png",
  "/brand/zoption-mark-512.png",
]);

const STATIC_PATH_PREFIXES = ["/assets/", "/brand/"];
const STATIC_PATHS = new Set(["/favicon.png", "/manifest.webmanifest", "/theme-bootstrap.js"]);

const SENSITIVE_PATH_PREFIXES = [
  "/api",
  "/app",
  "/auth",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/billing",
  "/checkout",
  "/account-deletion",
];

const SENSITIVE_PARAMETER_NAMES = new Set([
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "next",
  "redirect_to",
  "refresh_token",
  "state",
  "token",
]);

function hasPathPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => {
    const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`);
  });
}

function hasSensitiveParameters(url) {
  return [...url.searchParams.keys()].some((name) =>
    SENSITIVE_PARAMETER_NAMES.has(name.toLowerCase()),
  );
}

export function isSameOriginRequest(request, appOrigin) {
  return new URL(request.url).origin === appOrigin;
}

export function isSensitiveRequest(request, appOrigin) {
  if (request.method !== "GET") return true;

  const url = new URL(request.url);
  if (url.origin !== appOrigin) return true;
  if (request.headers?.has?.("authorization")) return true;
  if (hasPathPrefix(url.pathname, SENSITIVE_PATH_PREFIXES)) return true;
  return hasSensitiveParameters(url);
}

export function isStaticAssetRequest(request, appOrigin) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== appOrigin || url.search) return false;
  return STATIC_PATHS.has(url.pathname) || hasPathPrefix(url.pathname, STATIC_PATH_PREFIXES);
}

export function isCacheableResponse(response) {
  if (!response?.ok) return false;
  if (response.type !== "basic" && response.type !== "default") return false;

  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
  const vary = response.headers.get("vary")?.trim() ?? "";
  return !cacheControl.includes("no-store") && !cacheControl.includes("private") && vary !== "*";
}
