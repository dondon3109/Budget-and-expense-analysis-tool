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
