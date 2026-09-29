/**
 * Cookieless PostHog for the public site. `site.ts` imports this module only
 * once analytics consent is granted, so a visitor who never consents downloads
 * none of it. Events go to the same-origin `/ingest` proxy
 * (`functions/ingest/[[path]].ts`), which keeps the CSP at `connect-src 'self'`
 * and forwards no client address.
 */
import posthog, { type BeforeSendFn } from "posthog-js";
import { sanitizeAnalyticsProperties } from "@zoption/web-common/analytics-sanitize";
import { readConsentRecord } from "@zoption/web-common/consent-storage";

import { isTrackableUrl } from "../lib/trackableUrl";

// Hosts of AI answer engines, so a visit they sent can be told apart from search.
const AI_REFERRER_HOSTS: ReadonlyArray<readonly [host: string, engine: string]> = [
  ["chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["claude.ai", "claude"],
  ["gemini.google.com", "gemini"],
  ["copilot.microsoft.com", "copilot"],
  ["chat.deepseek.com", "deepseek"],
  ["meta.ai", "meta_ai"],
  ["you.com", "you"],
];

/** The answer engine a referrer belongs to, or undefined for every other referrer. */
export function aiReferrer(referrer: string): string | undefined {
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return undefined;
  }
  return AI_REFERRER_HOSTS.find(
    ([candidate]) => host === candidate || host.endsWith(`.${candidate}`),
  )?.[1];
}

/**
 * Every outbound event, the SDK's own web vitals included, passes here: it is
 * dropped once the stored consent is gone, and reduced to origin and path otherwise.
 * posthog-js's opt-out is inert under cookieless_mode "always", so this is the real stop.
 */
const gateAndSanitize: BeforeSendFn = (captureResult) => {
  if (!captureResult || readConsentRecord()?.preferences.analytics !== true) return null;
  const properties = sanitizeAnalyticsProperties(
    captureResult.properties,
  ) as typeof captureResult.properties;
  return { ...captureResult, properties };
};

let initialized = false;

export function startAnalytics(): (() => void) | undefined {
  const key = import.meta.env.PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return undefined;

  if (!initialized) {
    posthog.init(key, {
      api_host: import.meta.env.PUBLIC_POSTHOG_HOST?.trim() || "/ingest",
      ui_host: "https://us.posthog.com",
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
      before_send: gateAndSanitize,
      capture_performance: { web_vitals: true, web_vitals_allowed_metrics: ["LCP", "CLS", "INP"] },
    });
    initialized = true;
  }
  posthog.opt_in_capturing();

  if (
    document.body.dataset.trackable === "true" &&
    isTrackableUrl(location.search, location.hash)
  ) {
    const engine = aiReferrer(document.referrer);
    posthog.capture("$pageview", {
      $current_url: `${location.origin}${location.pathname}`,
      source: "site",
      ...(engine ? { ai_referrer: engine } : {}),
    });
  }

  return () => {
    try {
      posthog.opt_out_capturing();
    } catch {
      // Revoking consent must never surface an error to the visitor.
    }
  };
}
