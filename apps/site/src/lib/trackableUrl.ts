const TRACKING_PARAMETER_NAMES = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "dclid",
  "fbclid",
  "msclkid",
]);
const SENSITIVE_FRAGMENT_PARAMETER_NAMES = new Set([
  "code",
  "token",
  "access_token",
  "refresh_token",
  "error",
  "error_code",
  "error_description",
  "type",
  "next",
  "state",
  "redirect_to",
]);

/**
 * Whether a page view may be counted: its query carries only campaign
 * parameters and its fragment carries no auth state. The layout decides
 * whether the page itself is countable (the 404 page is not).
 */
export function isTrackableUrl(search: string, hash: string): boolean {
  const parameters = new URLSearchParams(search);
  const trackingOnly = [...parameters.keys()].every((name) =>
    TRACKING_PARAMETER_NAMES.has(name.toLowerCase()),
  );
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const sensitiveFragment = [...fragment.keys()].some((name) =>
    SENSITIVE_FRAGMENT_PARAMETER_NAMES.has(name.toLowerCase()),
  );
  return trackingOnly && !sensitiveFragment;
}
