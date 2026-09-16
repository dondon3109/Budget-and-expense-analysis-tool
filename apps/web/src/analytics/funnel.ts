import posthog from "posthog-js";

import { ensurePostHogInitialized } from "./PostHogAnalytics";

/**
 * The closed set of signup funnel events and the only properties each one may
 * carry. Every value is a fixed enum, so no event can carry an email, name,
 * amount, category, account or tenant identifier, free text, or a persistent
 * identifier.
 */
export interface FunnelEventProperties {
  signup_viewed: Record<string, never>;
  signup_submitted: { outcome: "confirmation_required" | "signed_in" | "failed" };
  app_session_started: Record<string, never>;
  first_import_committed: Record<string, never>;
  assistant_consent_granted: Record<string, never>;
  assistant_first_question: { surface: "chat" | "voice" };
}

export type FunnelEventName = keyof FunnelEventProperties;

/** The property keys each event is allowed to send, enforced at capture time. */
const FUNNEL_PROPERTY_KEYS: Record<FunnelEventName, readonly string[]> = {
  signup_viewed: [],
  signup_submitted: ["outcome"],
  app_session_started: [],
  first_import_committed: [],
  assistant_consent_granted: [],
  assistant_first_question: ["surface"],
};

/**
 * Events that describe a first occurrence. A session is one page load, kept in
 * memory only: nothing is written to the device, so a reload starts a new one.
 */
const ONCE_PER_PAGE_LOAD_EVENTS = new Set<FunnelEventName>([
  "app_session_started",
  "first_import_committed",
  "assistant_first_question",
]);

const capturedThisSession = new Set<FunnelEventName>();

function allowedProperties<Name extends FunnelEventName>(
  name: Name,
  properties: FunnelEventProperties[Name],
): Record<string, unknown> {
  const allowed = FUNNEL_PROPERTY_KEYS[name];
  return Object.fromEntries(
    Object.entries(properties as Record<string, unknown>).filter(([key]) => allowed.includes(key)),
  );
}

/**
 * Captures one funnel event from a wired surface. Analytics never blocks or
 * changes a user flow: with no PostHog key configured, or when capture fails,
 * this is a silent no-op.
 */
export function captureFunnelEvent<Name extends FunnelEventName>(
  name: Name,
  properties: FunnelEventProperties[Name],
): void {
  try {
    if (!ensurePostHogInitialized()) return;
    if (ONCE_PER_PAGE_LOAD_EVENTS.has(name)) {
      if (capturedThisSession.has(name)) return;
      capturedThisSession.add(name);
    }
    posthog.capture(name, allowedProperties(name, properties));
  } catch {
    // Analytics must never reach the user.
  }
}

/** Clears the once per page load guard between tests. */
export function resetFunnelForTests(): void {
  capturedThisSession.clear();
}
