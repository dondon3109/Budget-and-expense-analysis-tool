import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { isEligiblePublicUrl } from "../seo/siteMetadata";

function getPostHogKey(): string | undefined {
  return import.meta.env.VITE_POSTHOG_KEY?.trim();
}

function getPostHogHost(): string {
  return import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
}

let isInitialized = false;

/**
 * posthog-js attaches $current_url and $referrer from the browser, and a private route
 * can carry a search filter or an identifier in its query string on purpose (a bookmarked
 * transaction view, for example). Reduce both to the origin and path, the same shape the
 * manual pageview below sends, so no event can carry page parameters.
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

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...properties };

  for (const key of ["$current_url", "$referrer"]) {
    const value = sanitized[key];
    if (typeof value === "string" && value.length > 0) sanitized[key] = sanitizeAnalyticsUrl(value);
  }

  return sanitized;
}

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
    sanitize_properties: sanitizeAnalyticsProperties,
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

export function PostHogAnalytics() {
  const location = useLocation();
  const lastTrackedPathname = useRef<string | null>(null);
  const eligible = isEligiblePublicUrl(location.pathname, location.search, location.hash);

  useEffect(() => {
    if (!getPostHogKey()) return;

    if (!eligible) {
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
  }, [eligible, location.pathname]);

  return null;
}
