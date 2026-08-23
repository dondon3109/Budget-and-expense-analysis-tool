// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import posthog from "posthog-js";
import { StrictMode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostHogAnalytics, resetPostHogForTests } from "../src/analytics/PostHogAnalytics";

const POSTHOG_KEY = "phc_test_public_key_123";
const POSTHOG_HOST = "https://us.i.posthog.com";

vi.mock("posthog-js", () => {
  const capturedEvents: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  let initOptions: Record<string, unknown> | null = null;
  let initKey: string | null = null;

  return {
    default: {
      init: vi.fn((key: string, options: Record<string, unknown>) => {
        initKey = key;
        initOptions = options;
      }),
      capture: vi.fn((event: string, properties?: Record<string, unknown>) => {
        capturedEvents.push({ event, properties });
      }),
      reset: vi.fn(() => {
        capturedEvents.length = 0;
        initOptions = null;
        initKey = null;
      }),
      __getCapturedEvents: () => capturedEvents,
      __getInitOptions: () => initOptions,
      __getInitKey: () => initKey,
    },
  };
});

interface MockPostHog {
  init: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  reset: () => void;
  __getCapturedEvents: () => Array<{ event: string; properties?: Record<string, unknown> }>;
  __getInitOptions: () => Record<string, unknown> | null;
  __getInitKey: () => string | null;
}

const mockedPostHog = posthog as unknown as MockPostHog;

function AnalyticsApp({ initialEntry = "/" }: { initialEntry?: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <PostHogAnalytics />
      <Routes>
        <Route
          path="*"
          element={
            <nav>
              <Link to="/">Public home</Link>
              <Link to="/faq">Public FAQ</Link>
              <Link to="/install">Public Install</Link>
              <Link to="/app">Private Dashboard</Link>
              <Link to="/app/transactions">Private Transactions</Link>
              <Link to="/login">Private Login</Link>
              <Link to="/?code=secret">Sensitive parameter route</Link>
            </nav>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPostHog.reset();
  resetPostHogForTests();
  vi.stubEnv("VITE_POSTHOG_KEY", POSTHOG_KEY);
  vi.stubEnv("VITE_POSTHOG_HOST", POSTHOG_HOST);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockedPostHog.reset();
  resetPostHogForTests();
  vi.unstubAllEnvs();
});

describe("PostHog Web Analytics", () => {
  it("initializes with privacy-preserving, cookieless configuration on eligible public routes", async () => {
    render(<AnalyticsApp initialEntry="/" />);

    await waitFor(() => expect(mockedPostHog.init).toHaveBeenCalledTimes(1));

    expect(mockedPostHog.__getInitKey()).toBe(POSTHOG_KEY);
    expect(mockedPostHog.__getInitOptions()).toMatchObject({
      api_host: POSTHOG_HOST,
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

    const pageviews = mockedPostHog.__getCapturedEvents().filter((e) => e.event === "$pageview");
    expect(pageviews).toHaveLength(1);
    expect(pageviews[0]?.properties).toMatchObject({
      $current_url: "http://localhost:3000/",
      source: "web",
    });
  });

  it("does not initialize or capture when VITE_POSTHOG_KEY is not configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    render(<AnalyticsApp initialEntry="/" />);

    expect(mockedPostHog.init).not.toHaveBeenCalled();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);
  });

  it("does not initialize or track when landing directly on private/authenticated routes", async () => {
    render(<AnalyticsApp initialEntry="/app" />);

    expect(mockedPostHog.init).not.toHaveBeenCalled();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);
  });

  it("does not initialize or track when landing on authenticated subroutes or login", async () => {
    render(<AnalyticsApp initialEntry="/app/transactions" />);
    expect(mockedPostHog.init).not.toHaveBeenCalled();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);

    cleanup();
    render(<AnalyticsApp initialEntry="/login" />);
    expect(mockedPostHog.init).not.toHaveBeenCalled();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);
  });

  it("stops tracking when navigating from a public route to private financial routes", async () => {
    const user = userEvent.setup();
    render(<AnalyticsApp initialEntry="/" />);

    await waitFor(() => expect(mockedPostHog.init).toHaveBeenCalledTimes(1));
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(1);

    await user.click(screen.getByRole("link", { name: "Private Dashboard" }));
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(1); // No new event

    await user.click(screen.getByRole("link", { name: "Private Transactions" }));
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(1); // No new event

    await user.click(screen.getByRole("link", { name: "Public FAQ" }));
    await waitFor(() => expect(mockedPostHog.__getCapturedEvents()).toHaveLength(2));

    const events = mockedPostHog.__getCapturedEvents();
    expect(events[1]?.event).toBe("$pageview");
    expect(events[1]?.properties).toMatchObject({
      $current_url: "http://localhost:3000/faq",
      source: "web",
    });
  });

  it("excludes public URLs with sensitive query parameters from tracking", async () => {
    render(<AnalyticsApp initialEntry="/?code=secret" />);

    expect(mockedPostHog.init).not.toHaveBeenCalled();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);
  });

  it("captures public SPA pageview transitions without duplication", async () => {
    const user = userEvent.setup();
    render(<AnalyticsApp initialEntry="/" />);

    await waitFor(() => expect(mockedPostHog.__getCapturedEvents()).toHaveLength(1));

    await user.click(screen.getByRole("link", { name: "Public FAQ" }));
    await waitFor(() => expect(mockedPostHog.__getCapturedEvents()).toHaveLength(2));

    await user.click(screen.getByRole("link", { name: "Public Install" }));
    await waitFor(() => expect(mockedPostHog.__getCapturedEvents()).toHaveLength(3));

    await user.click(screen.getByRole("link", { name: "Public home" }));
    await waitFor(() => expect(mockedPostHog.__getCapturedEvents()).toHaveLength(4));

    const paths = mockedPostHog
      .__getCapturedEvents()
      .map((e) => (e.properties?.$current_url as string).replace("http://localhost:3000", ""));

    expect(paths).toEqual(["/", "/faq", "/install", "/"]);
  });

  it("emits only one pageview across a StrictMode double render", async () => {
    render(
      <StrictMode>
        <AnalyticsApp initialEntry="/faq" />
      </StrictMode>,
    );

    await waitFor(() => expect(mockedPostHog.__getCapturedEvents()).toHaveLength(1));

    const pageviews = mockedPostHog.__getCapturedEvents().filter((e) => e.event === "$pageview");
    expect(pageviews).toHaveLength(1);
    expect(pageviews[0]?.properties?.$current_url).toBe("http://localhost:3000/faq");
  });
});
