import posthog, { type BeforeSendFn } from "posthog-js";
// web_vitals needs the SDK's web-vitals extension, which it would otherwise download
// at runtime; disable_external_dependency_loading forbids that, so it ships in the bundle.
import "posthog-js/dist/web-vitals";
// Same reason: exception autocapture is an extension the SDK would otherwise download.
import "posthog-js/dist/exception-autocapture";
import { useEffect } from "react";

import { sanitizeAnalyticsProperties } from "@zoption/web-common/analytics-sanitize";
import { registerOptionalIntegration } from "@zoption/web-common/consent-gate";
import { readConsentRecord } from "@zoption/web-common/consent-storage";

function getPostHogKey(): string | undefined {
  return import.meta.env.VITE_POSTHOG_KEY?.trim();
}

function getPostHogHost(): string {
  return import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
}

let isInitialized = false;

/** The signed-in account PostHog attributes events to. */
export interface AnalyticsAccount {
  id: string;
  email?: string;
}

// The account is held here rather than identified on sight: consent can be
// granted after sign-in, and identification has to wait for it.
let currentAccount: AnalyticsAccount | null = null;
let identifiedAccountId: string | null = null;

/**
 * The stored analytics decision, read on every check rather than mirrored in
 * module state: analytics is only ever active with it, and a revocation in
 * another tab has to stop capture here too. Anything unreadable counts as a
 * denial.
 */
export function isAnalyticsConsented(): boolean {
  return readConsentRecord()?.preferences.analytics === true;
}

/**
 * The before_send hook the SDK is actually given: drop the event outright once
 * the analytics consent is gone, then sanitize what is left.
 *
 * The SDK's own opt_out_capturing() would write its decision to localStorage,
 * which this memory-only setup never does, so this hook — the one place that
 * sees every outbound event, including `$identify` and the SDK's own web
 * vitals — is the consent stop.
 */
const gateAndSanitizeAnalyticsEvent: BeforeSendFn = (captureResult) => {
  if (!captureResult || !isAnalyticsConsented()) return null;
  const scrubbed = scrubExceptionEvent(captureResult);
  if (!scrubbed) return null;
  return sanitizeAnalyticsEvent(scrubbed);
};

/** One exception the SDK built: its class, its message, and its parsed stack. */
interface ExceptionEntry {
  type?: unknown;
  mechanism?: { type?: unknown; handled?: unknown; exception_id?: unknown; parent_id?: unknown };
  stacktrace?: { frames?: unknown };
}

interface StackFrame {
  platform?: unknown;
  filename?: unknown;
  function?: unknown;
  lineno?: unknown;
  colno?: unknown;
  in_app?: unknown;
  chunk_id?: unknown;
}

function scrubFrame(frame: StackFrame) {
  return {
    platform: frame.platform,
    // A bundle URL never carries a query here, but a page frame would carry the route's.
    filename: typeof frame.filename === "string" ? frame.filename.split(/[?#]/)[0] : undefined,
    function: frame.function,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    chunk_id: frame.chunk_id,
  };
}

function scrubException(entry: ExceptionEntry) {
  const type = typeof entry.type === "string" && entry.type ? entry.type : "Error";
  const frames = Array.isArray(entry.stacktrace?.frames)
    ? (entry.stacktrace.frames as StackFrame[]).map(scrubFrame)
    : undefined;
  return {
    type,
    // PostHog groups and titles by value; the class stands in for the message.
    value: type,
    mechanism: {
      type: entry.mechanism?.type,
      handled: entry.mechanism?.handled,
      exception_id: entry.mechanism?.exception_id,
      parent_id: entry.mechanism?.parent_id,
    },
    ...(frames ? { stacktrace: { type: "raw", frames } } : {}),
  };
}

/**
 * An error message can quote what the user typed or what the API returned (a payee, an
 * amount), so a `$exception` leaves with only the error class and code locations, the
 * same boundary as mobile crash reports. Every other `$exception_*` property (the
 * message copies, the breadcrumb steps) is dropped; non-exception events pass through.
 */
export const scrubExceptionEvent: BeforeSendFn = (captureResult) => {
  if (!captureResult || captureResult.event !== "$exception") return captureResult;
  const source: Record<string, unknown> = captureResult.properties;
  const list = source.$exception_list;
  const properties: typeof captureResult.properties = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith("$exception_") || key === "$exception_level") properties[key] = value;
  }
  properties.$exception_list = Array.isArray(list)
    ? (list as ExceptionEntry[]).map(scrubException)
    : [];
  return { ...captureResult, properties };
};

/**
 * Reports a render failure the app's error boundary caught. React keeps those away
 * from window.onerror, so autocapture never sees them. A no-op until analytics is
 * initialized; the before_send gate still applies consent and the scrub.
 */
export function captureAppException(error: unknown, source: string): void {
  if (!isInitialized) return;
  try {
    posthog.captureException(error, { source });
  } catch {
    // Error reporting must never surface a second failure.
  }
}

/**
 * posthog-js attaches $current_url, $referrer, $pathname and $host from the browser, and a
 * private route can carry a search filter or an identifier in its query string on purpose (a
 * bookmarked transaction view, for example). Reduce all of them to the origin and path, the
 * same shape the manual pageview below sends, so no event can carry page parameters.
 *
 * before_send runs on the outbound payload after the SDK has finished building properties,
 * which is what sanitize_properties used to do; the SDK now marks that hook deprecated.
 * Returning null drops an event, so this hook can never make a payload less safe.
 */
export const sanitizeAnalyticsEvent: BeforeSendFn = (captureResult) => {
  if (!captureResult) return null;
  // The sanitizer only ever rewrites a string property into another string, so the SDK's
  // property type survives the round trip.
  const properties = sanitizeAnalyticsProperties(
    captureResult.properties,
  ) as typeof captureResult.properties;
  return { ...captureResult, properties };
};

export function ensurePostHogInitialized(): boolean {
  const posthogKey = getPostHogKey();
  if (!posthogKey) return false;
  if (isInitialized) return true;

  // No cookieless_mode: the SDK ignores identify() in it. persistence "memory"
  // still keeps every identifier out of cookies and storage, so a reload starts
  // anonymous until the session restore identifies the account again.
  posthog.init(posthogKey, {
    api_host: getPostHogHost(),
    persistence: "memory",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    before_send: gateAndSanitizeAnalyticsEvent,
    // Uncaught errors and rejections go to Error Tracking; console.error stays out
    // because the app logs handled failures there.
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    capture_performance: {
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "CLS", "INP"],
    },
  });

  isInitialized = true;
  return true;
}

/**
 * Identifies the consented, signed-in account by its Supabase user id with the
 * email as a person property, and drops the identity once nobody is signed in
 * so the next person in this tab starts anonymous.
 */
function applyAnalyticsIdentity(): void {
  if (!isInitialized || !isAnalyticsConsented()) return;
  try {
    if (currentAccount && identifiedAccountId !== currentAccount.id) {
      posthog.identify(
        currentAccount.id,
        currentAccount.email ? { email: currentAccount.email } : undefined,
      );
      identifiedAccountId = currentAccount.id;
      return;
    }
    if (!currentAccount && identifiedAccountId) {
      posthog.reset();
      identifiedAccountId = null;
    }
  } catch {
    // Analytics must never reach the user.
  }
}

/** Records the signed-in account (or null after sign-out) for analytics. */
export function setAnalyticsAccount(account: AnalyticsAccount | null): void {
  currentAccount = account;
  applyAnalyticsIdentity();
}

export function resetPostHogForTests(): void {
  isInitialized = false;
  currentAccount = null;
  identifiedAccountId = null;
  try {
    posthog.reset();
  } catch {
    // Ignore test cleanup errors
  }
}

/**
 * Starts PostHog as an optional analytics integration. The consent gate calls
 * this only while the analytics category is granted, and the returned cleanup
 * runs when the visitor revokes it: the before_send gate above then drops every
 * event, and the identity is cleared so a later grant identifies afresh.
 */
function startAnalytics(): (() => void) | undefined {
  if (!ensurePostHogInitialized()) return undefined;
  applyAnalyticsIdentity();

  return () => {
    try {
      posthog.reset();
      identifiedAccountId = null;
    } catch {
      // Revoking consent must never surface an error to the visitor.
    }
  };
}

/**
 * Registers PostHog with the consent gate. The app sends no pageviews (every route
 * is private and the public site counts its own); only the funnel events in
 * `funnel.ts` go out, attributed to the signed-in account, and only after
 * analytics consent.
 */
export function PostHogAnalytics() {
  useEffect(() => registerOptionalIntegration("analytics", startAnalytics), []);

  return null;
}
