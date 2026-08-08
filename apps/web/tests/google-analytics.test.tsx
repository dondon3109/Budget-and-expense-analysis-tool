// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ComponentType } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConsentPreferences } from "../src/consent/consent";

const MEASUREMENT_ID = "G-TEST123";
const SCRIPT_SELECTOR = 'script[data-zoption-google-analytics="true"]';

let GoogleAnalyticsComponent: ComponentType;
let consentGate: {
  resetConsentGateForTests(): void;
  updateConsentGate(preferences: ConsentPreferences): void;
};

function AnalyticsRoutes({ initialEntry = "/" }: { initialEntry?: string }) {
  const GoogleAnalytics = GoogleAnalyticsComponent;
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <GoogleAnalytics />
      <Routes>
        <Route
          path="*"
          element={
            <nav>
              <Link to="/">Public home</Link>
              <Link to="/login">Private login</Link>
              <Link to="/faq">Public FAQ</Link>
              <Link to="/?code=secret">Sensitive callback state</Link>
            </nav>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function pageViewPaths(): string[] {
  return (window.dataLayer ?? []).flatMap((entry) => {
    if (!Array.isArray(entry) || entry[0] !== "event" || entry[1] !== "page_view") return [];
    const parameters: unknown = entry[2];
    if (!parameters || typeof parameters !== "object" || !("page_path" in parameters)) return [];
    return [String(parameters.page_path)];
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_GA_MEASUREMENT_ID", MEASUREMENT_ID);
  ({ GoogleAnalytics: GoogleAnalyticsComponent } =
    await import("../src/analytics/GoogleAnalytics"));
  consentGate = await import("../src/consent/consentGate");
});

afterEach(() => {
  cleanup();
  consentGate.resetConsentGateForTests();
  vi.unstubAllEnvs();
  document.querySelectorAll(SCRIPT_SELECTOR).forEach((script) => script.remove());
  delete window.gtag;
  delete window.dataLayer;
  delete (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`];
  document.cookie = "_ga=; Max-Age=0; path=/";
  document.cookie = "_ga_TEST123=; Max-Age=0; path=/";
});

describe("Google Analytics route and consent gating", () => {
  it("loads only with consent on public URLs and tears down on private routes", async () => {
    const user = userEvent.setup();
    document.cookie = "_ga=stale; path=/";
    render(<AnalyticsRoutes />);

    await waitFor(() => expect(document.cookie).not.toContain("_ga=stale"));
    expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeInTheDocument();
    expect(
      (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`],
    ).toBe(true);

    consentGate.updateConsentGate({ analytics: true, marketing: false });
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());
    expect(
      (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`],
    ).toBeUndefined();
    expect(window.gtag).toBeTypeOf("function");
    expect(pageViewPaths()).toEqual(["/"]);

    document.cookie = "_ga=active; path=/";
    document.cookie = "_ga_TEST123=active; path=/";
    (window as unknown as Window & Record<string, unknown>).google_tag_manager = { active: true };
    await user.click(screen.getByRole("link", { name: "Private login" }));

    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeInTheDocument());
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
    expect(
      (window as unknown as Window & Record<string, unknown>).google_tag_manager,
    ).toBeUndefined();
    expect(
      (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`],
    ).toBe(true);
    expect(document.cookie).not.toContain("_ga=active");
    expect(document.cookie).not.toContain("_ga_TEST123=active");

    await user.click(screen.getByRole("link", { name: "Public FAQ" }));
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());
    expect(
      (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`],
    ).toBeUndefined();
    expect(pageViewPaths()).toEqual(["/faq"]);

    document.cookie = "_ga=withdrawn; path=/";
    consentGate.updateConsentGate({ analytics: false, marketing: false });
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeInTheDocument());
    expect(window.gtag).toBeUndefined();
    expect(document.cookie).not.toContain("_ga=withdrawn");
    expect(
      (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`],
    ).toBe(true);

    consentGate.updateConsentGate({ analytics: true, marketing: false });
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());
    expect(pageViewPaths()).toEqual(["/faq"]);
  });

  it("keeps sensitive query state on a public path disabled even with consent", async () => {
    consentGate.updateConsentGate({ analytics: true, marketing: false });
    document.cookie = "_ga=stale; path=/";
    const staleScript = document.createElement("script");
    staleScript.dataset.zoptionGoogleAnalytics = "true";
    document.head.append(staleScript);
    window.dataLayer = [["stale"]];
    window.gtag = vi.fn();

    render(<AnalyticsRoutes initialEntry="/?code=secret" />);

    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeInTheDocument());
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
    expect(document.cookie).not.toContain("_ga=stale");
    expect(
      (window as unknown as Window & Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`],
    ).toBe(true);
  });

  it("emits one page view on consented startup and once per public route", async () => {
    const user = userEvent.setup();
    consentGate.updateConsentGate({ analytics: true, marketing: false });

    render(<AnalyticsRoutes />);
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());
    expect(pageViewPaths()).toEqual(["/"]);

    await user.click(screen.getByRole("link", { name: "Public FAQ" }));
    await waitFor(() => expect(pageViewPaths()).toEqual(["/", "/faq"]));

    await user.click(screen.getByRole("link", { name: "Public home" }));
    await waitFor(() => expect(pageViewPaths()).toEqual(["/", "/faq", "/"]));
  });

  it("preserves GA cookies on a consented public route when the component remounts", async () => {
    consentGate.updateConsentGate({ analytics: true, marketing: false });
    document.cookie = "_ga=preserved; path=/";
    document.cookie = "_ga_TEST123=preserved; path=/";

    render(<AnalyticsRoutes initialEntry="/faq" />);
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());
    expect(window.gtag).toBeTypeOf("function");

    cleanup();
    render(<AnalyticsRoutes initialEntry="/faq" />);
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());

    expect(document.cookie).toContain("_ga=preserved");
    expect(document.cookie).toContain("_ga_TEST123=preserved");
  });
});

describe("Google Analytics StrictMode lifecycle", () => {
  it("keeps one GA instance and page view across a StrictMode double effect", async () => {
    consentGate.updateConsentGate({ analytics: true, marketing: false });
    document.cookie = "_ga=still-here; path=/";

    render(
      <StrictMode>
        <AnalyticsRoutes initialEntry="/faq" />
      </StrictMode>,
    );
    await waitFor(() => expect(document.querySelector(SCRIPT_SELECTOR)).toBeInTheDocument());

    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
    expect(document.cookie).toContain("_ga=still-here");
    expect(window.gtag).toBeTypeOf("function");
    expect(pageViewPaths()).toEqual(["/faq"]);
  });
});
