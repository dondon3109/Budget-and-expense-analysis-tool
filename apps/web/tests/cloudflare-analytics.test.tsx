// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConsentPreferences } from "../src/consent/consent";

const SITE_TOKEN = "0123456789abcdef0123456789abcdef";
const SCRIPT_SELECTOR = 'script[data-zoption-cloudflare-analytics="true"]';

let CloudflareAnalyticsComponent: ComponentType;
let consentGate: {
  resetConsentGateForTests(): void;
  updateConsentGate(preferences: ConsentPreferences): void;
};

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN", SITE_TOKEN);
  ({ CloudflareAnalytics: CloudflareAnalyticsComponent } =
    await import("../src/analytics/CloudflareAnalytics"));
  consentGate = await import("../src/consent/consentGate");
});

afterEach(() => {
  cleanup();
  consentGate.resetConsentGateForTests();
  vi.unstubAllEnvs();
  document.querySelectorAll(SCRIPT_SELECTOR).forEach((script) => script.remove());
  delete window.__cfBeacon;
});

describe("Cloudflare Web Analytics consent gating", () => {
  it("loads the SPA beacon only after analytics consent and removes it on withdrawal", async () => {
    render(<CloudflareAnalyticsComponent />);

    expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeInTheDocument();

    consentGate.updateConsentGate({ analytics: true, marketing: false });
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());

    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(script).toHaveAttribute("src", "https://static.cloudflareinsights.com/beacon.min.js");
    expect(JSON.parse(script?.dataset.cfBeacon ?? "{}")).toEqual({
      version: "2024.11.0",
      token: SITE_TOKEN,
      spa: true,
    });

    consentGate.updateConsentGate({ analytics: false, marketing: false });
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeInTheDocument());
    expect(window.__cfBeacon).toBeUndefined();
  });

  it("keeps one beacon during a StrictMode double effect", async () => {
    consentGate.updateConsentGate({ analytics: true, marketing: false });

    render(
      <StrictMode>
        <CloudflareAnalyticsComponent />
      </StrictMode>,
    );

    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
  });
});
