import { setTimeout as delay } from "node:timers/promises";

function asOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an exact HTTPS origin.`);
  }
  return url.origin;
}

export function parseContentSecurityPolicy(value) {
  const directives = new Map();
  for (const segment of value.split(";")) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift();
    if (!name) continue;
    if (directives.has(name)) throw new Error(`CSP contains duplicate ${name} directives.`);
    directives.set(name, tokens);
  }
  return directives;
}

export function assertDeploymentContentSecurityPolicy(
  value,
  { apiUrl, expectedSupabaseUrl, forbiddenSupabaseOrigins = [] },
) {
  if (!value?.trim()) throw new Error("Frontend response is missing Content-Security-Policy.");

  const apiOrigin = asOrigin(apiUrl, "API_URL");
  const expectedSupabaseOrigin = asOrigin(expectedSupabaseUrl, "EXPECTED_SUPABASE_URL");
  const forbiddenOrigins = forbiddenSupabaseOrigins.map((origin) =>
    asOrigin(origin, "FORBIDDEN_SUPABASE_ORIGINS"),
  );
  const directives = parseContentSecurityPolicy(value);
  const connectSources = directives.get("connect-src") ?? [];
  const imageSources = directives.get("img-src") ?? [];

  for (const [sources, expected, label] of [
    [connectSources, apiOrigin, "connect-src API origin"],
    [connectSources, expectedSupabaseOrigin, "connect-src Supabase origin"],
    [imageSources, expectedSupabaseOrigin, "img-src Supabase origin"],
  ]) {
    if (!sources.includes(expected)) throw new Error(`CSP is missing the expected ${label}.`);
  }

  const allSources = [...directives.values()].flat();
  if (allSources.some((source) => source.includes("*"))) {
    throw new Error("CSP contains a forbidden wildcard source.");
  }
  for (const forbiddenOrigin of forbiddenOrigins) {
    if (allSources.includes(forbiddenOrigin)) {
      throw new Error("CSP contains a forbidden Supabase origin.");
    }
  }

  const managedSupabaseOrigins = new Set(
    allSources.filter((source) => {
      try {
        return new URL(source).hostname.endsWith(".supabase.co");
      } catch {
        return false;
      }
    }),
  );
  if (expectedSupabaseOrigin.endsWith(".supabase.co")) {
    if (managedSupabaseOrigins.size !== 1 || !managedSupabaseOrigins.has(expectedSupabaseOrigin)) {
      throw new Error("CSP contains an unexpected managed Supabase origin.");
    }
  }
}

export function assertFrontendAssetOrigins(
  sources,
  { apiUrl, expectedSupabaseUrl, forbiddenSupabaseOrigins = [] },
) {
  const combined = sources.join("\n");
  const apiOrigin = asOrigin(apiUrl, "API_URL");
  const expectedSupabaseOrigin = asOrigin(expectedSupabaseUrl, "EXPECTED_SUPABASE_URL");
  if (!combined.includes(apiOrigin)) {
    throw new Error("The deployed frontend does not contain the configured API origin.");
  }
  if (!combined.includes(expectedSupabaseOrigin)) {
    throw new Error("The deployed frontend does not contain the expected Supabase origin.");
  }
  for (const origin of forbiddenSupabaseOrigins.map((value) =>
    asOrigin(value, "FORBIDDEN_SUPABASE_ORIGINS"),
  )) {
    if (combined.includes(origin)) {
      throw new Error("The deployed frontend contains a forbidden Supabase origin.");
    }
  }
}

/**
 * Fetches the complete JavaScript chunk graph referenced by a deployed page.
 * Pages can expose a new release marker before every immutable chunk has
 * reached the same edge, so release propagation and smoke verification share
 * this availability check.
 */
export async function fetchFrontendScriptGraph(
  html,
  webUrl,
  fetchImpl = fetch,
  options = {},
) {
  const maxAttempts = options.maxAttempts ?? (fetchImpl === fetch ? 4 : 1);
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const pending = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(
    (match) => new URL(match[1], webUrl).href,
  );
  const visited = new Set();
  const sources = [];

  while (pending.length > 0) {
    const assetUrl = pending.pop();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await fetchImpl(assetUrl, { cache: "no-store" });
      if (response.ok) break;
      if (attempt < maxAttempts) {
        await delay(retryDelayMs);
      }
    }
    if (!response || !response.ok) {
      throw new Error(`Frontend asset ${assetUrl} failed with HTTP ${response?.status}.`);
    }
    const source = await response.text();
    sources.push(source);
    for (const match of source.matchAll(/["']([^"']+\.js)["']/g)) {
      const assetPath = match[1];
      if (!/^(?:\.\/|\/?assets\/)/.test(assetPath)) continue;
      const baseUrl = assetPath.startsWith("./") ? assetUrl : `${webUrl}/`;
      pending.push(new URL(assetPath, baseUrl).href);
    }
  }

  return sources;
}
