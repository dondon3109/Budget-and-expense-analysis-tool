import posthog from "posthog-js";

import type { TransactionKind } from "@zoption/shared";

import type { SocialAuthProvider } from "../auth/AuthProvider";
import { ensurePostHogInitialized, isAnalyticsConsented } from "./PostHogAnalytics";

/** The signed-in pages `page_viewed` can name; admin pages are left out on purpose. */
export type AppPage =
  | "overview"
  | "assistant"
  | "calendar"
  | "transactions"
  | "import"
  | "budgets"
  | "subscriptions"
  | "plan"
  | "pet"
  | "settings"
  | "tutorials"
  | "support";

type NoProperties = Record<string, never>;

/**
 * The closed set of app events (the signup funnel plus feature usage) and the
 * only properties each one may carry. Every value is a fixed enum, so no event
 * can carry an amount, category, financial account or tenant identifier, or
 * free text. The signed-in account is attached by `identify()` in
 * `PostHogAnalytics.tsx`, never as an event property. Feature events share their names with
 * the mobile app's, so one PostHog breakdown by `$lib` compares both clients.
 */
export interface FunnelEventProperties {
  signup_viewed: NoProperties;
  /** A Google sign-up is counted when the redirect starts; its finish is the next app_session_started. */
  signup_submitted:
    | { method: "password"; outcome: "confirmation_required" | "signed_in" | "failed" }
    | { method: SocialAuthProvider; outcome: "redirect_started" | "failed" };
  app_session_started: NoProperties;
  first_import_committed: NoProperties;
  assistant_consent_granted: NoProperties;
  assistant_first_question: { surface: "chat" | "voice" };
  page_viewed: { page: AppPage };
  transaction_created: { transaction_kind: TransactionKind };
  transaction_updated: NoProperties;
  transaction_deleted: NoProperties;
  budget_saved: { scope: "month" | "every-month" | "occasion" };
  goal_created: NoProperties;
  goal_updated: NoProperties;
  goal_deleted: NoProperties;
  debt_created: NoProperties;
  debt_updated: NoProperties;
  debt_deleted: NoProperties;
  subscription_created: NoProperties;
  subscription_updated: NoProperties;
  subscription_deleted: NoProperties;
  import_completed: NoProperties;
  voice_entry_drafted: NoProperties;
  receipt_scanned: NoProperties;
  sms_paste_applied: NoProperties;
  assistant_message_sent: { kind: "text" | "voice" };
  assistant_transaction_saved: NoProperties;
  assistant_action_confirmed: NoProperties;
  pet_egg_chosen: NoProperties;
  pet_hatched: NoProperties;
  pet_color_set: NoProperties;
  pet_enabled_set: { enabled: boolean };
}

export type FunnelEventName = keyof FunnelEventProperties;

/** The property keys each event is allowed to send, enforced at capture time. */
const FUNNEL_PROPERTY_KEYS: Record<FunnelEventName, readonly string[]> = {
  signup_viewed: [],
  signup_submitted: ["method", "outcome"],
  app_session_started: [],
  first_import_committed: [],
  assistant_consent_granted: [],
  assistant_first_question: ["surface"],
  page_viewed: ["page"],
  transaction_created: ["transaction_kind"],
  transaction_updated: [],
  transaction_deleted: [],
  budget_saved: ["scope"],
  goal_created: [],
  goal_updated: [],
  goal_deleted: [],
  debt_created: [],
  debt_updated: [],
  debt_deleted: [],
  subscription_created: [],
  subscription_updated: [],
  subscription_deleted: [],
  import_completed: [],
  voice_entry_drafted: [],
  receipt_scanned: [],
  sms_paste_applied: [],
  assistant_message_sent: ["kind"],
  assistant_transaction_saved: [],
  assistant_action_confirmed: [],
  pet_egg_chosen: [],
  pet_hatched: [],
  pet_color_set: [],
  pet_enabled_set: ["enabled"],
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
 * changes a user flow: without a stored analytics consent, with no PostHog key
 * configured, or when capture fails, this is a silent no-op.
 *
 * This path can fire before the consent provider mounts, so it checks the stored
 * decision itself instead of trusting the gate's in-memory state.
 */
export function captureFunnelEvent<Name extends FunnelEventName>(
  name: Name,
  properties: FunnelEventProperties[Name],
): void {
  try {
    if (!isAnalyticsConsented()) return;
    if (!ensurePostHogInitialized()) return;
    if (ONCE_PER_PAGE_LOAD_EVENTS.has(name)) {
      if (capturedThisSession.has(name)) return;
      capturedThisSession.add(name);
    }
    // A sign-up can leave the page right after (the Google redirect, the move into
    // the app), so it skips the batch queue that an unload would drop.
    posthog.capture(
      name,
      allowedProperties(name, properties),
      name === "signup_submitted" ? { send_instantly: true } : undefined,
    );
  } catch {
    // Analytics must never reach the user.
  }
}

/** Clears the once per page load guard between tests. */
export function resetFunnelForTests(): void {
  capturedThisSession.clear();
}
