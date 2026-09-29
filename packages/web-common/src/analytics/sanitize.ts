/**
 * Payload reducers every web surface applies to analytics events before they
 * leave the browser: URLs keep only origin and path, and hosts keep only the host.
 */
export function sanitizeAnalyticsUrl(value: string): string {
  const withoutFragment = value.split("#")[0] ?? value;
  const withoutQuery = withoutFragment.split("?")[0] ?? withoutFragment;

  try {
    const url = new URL(withoutQuery);
    return `${url.origin}${url.pathname}`;
  } catch {
    return withoutQuery;
  }
}

/**
 * The bare lowercase host of an origin, host or host:port value. Anything that
 * is not a host at all fails closed and is left for the caller to drop.
 */
function sanitizeAnalyticsHost(value: string): string | undefined {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host;
  } catch {
    return undefined;
  }
}

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...properties };

  // posthog-js attaches $pathname and $host itself, so they need the same
  // reduction as the URLs it builds: a manual pageview cannot know they are there.
  for (const key of ["$current_url", "$referrer", "$pathname"]) {
    const value = sanitized[key];
    if (typeof value === "string" && value.length > 0) sanitized[key] = sanitizeAnalyticsUrl(value);
  }

  const host = sanitized["$host"];
  if (typeof host === "string" && host.length > 0) {
    const normalizedHost = sanitizeAnalyticsHost(host);
    if (normalizedHost) sanitized["$host"] = normalizedHost;
    else delete sanitized["$host"];
  }

  return sanitized;
}
