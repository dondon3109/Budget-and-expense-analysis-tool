/**
 * The closed set of interaction events the public site may send, besides its
 * one `$pageview`. None carries a property: no amount, percentage, or text a
 * visitor typed ever leaves the page.
 */
export const SITE_EVENTS = [
  "budget_calculator_used",
  "budget_calculator_signup_clicked",
  "subscription_calculator_used",
  "subscription_calculator_signup_clicked",
] as const;
export type SiteEvent = (typeof SITE_EVENTS)[number];

export const SITE_EVENT_NAME = "zoption:site-event";

export function isSiteEvent(value: unknown): value is SiteEvent {
  return SITE_EVENTS.some((event) => event === value);
}

/**
 * Announces an event without importing PostHog, so an island stays free of the
 * SDK. `analytics.ts` listens only after consent; before that nobody hears it.
 */
export function announceSiteEvent(event: SiteEvent): void {
  window.dispatchEvent(new CustomEvent(SITE_EVENT_NAME, { detail: event }));
}

/**
 * The signup links the tools send visitors to; `from` is the app's only clue where
 * they came from, so each value must be in `apps/web/src/lib/signupSource.ts`.
 */
export const BUDGET_CALCULATOR_SIGNUP_PATH = "/signup?from=budget-calculator";
export const SUBSCRIPTION_CALCULATOR_SIGNUP_PATH = "/signup?from=subscription-calculator";
