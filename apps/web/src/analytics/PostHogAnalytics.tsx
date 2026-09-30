import posthog, { type BeforeSendFn } from "posthog-js";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

import { sanitizeAnalyticsProperties } from "@zoption/web-common/analytics-sanitize";
import {
  getConsentGatePreferences,
  registerOptionalIntegration,
  subscribeToConsentGate,
} from "@zoption/web-common/consent-gate";
import { readConsentRecord } from "@zoption/web-common/consent-storage";

import { isEligiblePublicUrl } from "../seo/siteMetadata";

function getPostHogKey(): string | undefined {
  return import.meta.env.VITE_POSTHOG_KEY?.trim();
}

function getPostHogHost(): string {
  return import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
}

let isInitialized = false;

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
 * posthog-js cannot stop on its own here. Its opt_out_capturing() returns early
 * with a warning while cookieless_mode is "always", and is_capturing() is true
 * for that mode regardless of consent, so this hook — the one place that sees
 * every outbound event, including the SDK's own web vitals — is the real stop.
 */
const gateAndSanitizeAnalyticsEvent: BeforeSendFn = (captureResult) => {
  if (!captureResult || !isAnalyticsConsented()) return null;
  return sanitizeAnalyticsEvent(captureResult);
};

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

  posthog.init(posthogKey, {
    api_host: getPostHogHost(),
    cookieless_mode: "always",
    persistence: "memory",
    person_profiles: "never",
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    before_send: gateAndSanitizeAnalyticsEvent,
    capture_performance: {
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "CLS", "INP"],
    },
  });

  isInitialized = true;
  return true;
}

export function resetPostHogForTests(): void {
  isInitialized = false;
  try {
    posthog.reset();
  } catch {
    // Ignore test cleanup errors
  }
}

/**
 * Starts PostHog as an optional analytics integration. The consent gate calls
 * this only while the analytics category is granted, and the returned cleanup
 * runs when the visitor revokes it: the SDK instance stays alive for the rest of
 * the page load, so opt_out_capturing() is the SDK's own switch. Under
 * cookieless_mode "always" that call is inert, which is why the before_send gate
 * above carries the guarantee.
 */
function startAnalytics(): (() => void) | undefined {
  if (!ensurePostHogInitialized()) return undefined;
  posthog.opt_in_capturing();

  return () => {
    try {
      posthog.opt_out_capturing();
    } catch {
      // Revoking consent must never surface an error to the visitor.
    }
  };
}

export function PostHogAnalytics() {
  const location = useLocation();
  const lastTrackedPathname = useRef<string | null>(null);
  const analyticsConsented = useSyncExternalStore(
    subscribeToConsentGate,
    () => getConsentGatePreferences().analytics,
  );
  const eligible = isEligiblePublicUrl(location.pathname, location.search, location.hash);

  useEffect(() => registerOptionalIntegration("analytics", startAnalytics), []);

  useEffect(() => {
    if (!analyticsConsented || !eligible) {
      lastTrackedPathname.current = null;
      return;
    }

    const initialized = ensurePostHogInitialized();
    if (!initialized) return;

    if (lastTrackedPathname.current !== location.pathname) {
      lastTrackedPathname.current = location.pathname;
      posthog.capture("$pageview", {
        $current_url: `${window.location.origin}${location.pathname}`,
        source: "web",
      });
    }
  }, [analyticsConsented, eligible, location.pathname]);

  return null;
}
