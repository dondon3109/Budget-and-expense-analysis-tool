import { useEffect } from "react";

import { registerOptionalIntegration } from "../consent/consentGate";

const siteToken = import.meta.env.VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
const CLOUDFLARE_ANALYTICS_SCRIPT_SELECTOR =
  'script[data-zoption-cloudflare-analytics="true"], script[src^="https://static.cloudflareinsights.com/beacon.min.js"]';
const productionBuild =
  typeof __SEARCH_INDEXING_ENABLED__ === "undefined" || __SEARCH_INDEXING_ENABLED__;

declare global {
  interface Window {
    __cfBeacon?: Record<string, unknown>;
  }
}

function removeCloudflareAnalytics(): void {
  document
    .querySelectorAll<HTMLScriptElement>(CLOUDFLARE_ANALYTICS_SCRIPT_SELECTOR)
    .forEach((script) => script.remove());
  delete window.__cfBeacon;
}

function enableCloudflareAnalytics(): () => void {
  removeCloudflareAnalytics();

  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.dataset.cfBeacon = JSON.stringify({
    version: "2024.11.0",
    token: siteToken,
    spa: true,
  });
  script.dataset.zoptionCloudflareAnalytics = "true";
  document.body.append(script);

  return () => {
    script.remove();
    if (!document.querySelector(CLOUDFLARE_ANALYTICS_SCRIPT_SELECTOR)) {
      delete window.__cfBeacon;
    }
  };
}

export function CloudflareAnalytics() {
  useEffect(() => {
    if (!productionBuild || !siteToken) return;
    return registerOptionalIntegration("analytics", enableCloudflareAnalytics);
  }, []);

  return null;
}
