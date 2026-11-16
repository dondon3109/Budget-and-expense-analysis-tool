/**
 * Where a visitor came from when a public site link named it. The site and the
 * app never share an identity (the site is cookieless and never identifies
 * anyone), so this tag on the signup events is the only join between them.
 */
export type SignupSource = "budget_calculator" | "subscription_calculator";

/** `from` values the public site links use; `apps/site/src/lib/siteEvents.ts` owns the link. */
const SIGNUP_SOURCES: Record<string, SignupSource> = {
  "budget-calculator": "budget_calculator",
  "subscription-calculator": "subscription_calculator",
};

/** The `from` query parameter as a known source; anything else is dropped. */
export function signupSourceFrom(search: string): SignupSource | undefined {
  const from = new URLSearchParams(search).get("from");
  return from ? SIGNUP_SOURCES[from] : undefined;
}
