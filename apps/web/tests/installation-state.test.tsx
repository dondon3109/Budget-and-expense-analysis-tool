// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectInstallationEnvironment,
  InstallationProvider,
  useInstallation,
  type BeforeInstallPromptEvent,
} from "../src/pwa/installation";

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";

function setNavigatorValue(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

function installMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: "(display-mode: standalone)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  return { media, listeners };
}

function setChromeEnvironment() {
  setNavigatorValue("userAgent", CHROME_USER_AGENT);
  setNavigatorValue("platform", "MacIntel");
  setNavigatorValue("maxTouchPoints", 0);
  setNavigatorValue("userAgentData", {
    brands: [
      { brand: "Not_A Brand", version: "99" },
      { brand: "Google Chrome", version: "140" },
    ],
  });
  setNavigatorValue("brave", undefined);
}

function Harness() {
  const installation = useInstallation();
  return (
    <div>
      <output data-testid="status">{installation.status}</output>
      <button type="button" onClick={() => void installation.install()}>
        Install
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <InstallationProvider>
      <Harness />
    </InstallationProvider>,
  );
}

function installPromptEvent(outcome: "accepted" | "dismissed", prompt = vi.fn()) {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome }) },
  });
  return event;
}

beforeEach(() => {
  installMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const key of ["userAgent", "platform", "maxTouchPoints", "userAgentData", "brave"]) {
    Reflect.deleteProperty(navigator, key);
  }
});

describe("installation environment detection", () => {
  it("recognizes supported Google Chrome without treating other Chromium browsers as Chrome", () => {
    expect(
      detectInstallationEnvironment({
        userAgent: CHROME_USER_AGENT,
        brands: [{ brand: "Google Chrome" }],
      }),
    ).toBe("supported-chrome");
    expect(
      detectInstallationEnvironment({
        userAgent: CHROME_USER_AGENT,
        brands: [{ brand: "Chromium" }],
      }),
    ).toBe("unsupported-browser");

    for (const userAgent of [
      `${CHROME_USER_AGENT} Edg/140.0.0.0`,
      `${CHROME_USER_AGENT} OPR/120.0.0.0`,
      `${CHROME_USER_AGENT} SamsungBrowser/28.0`,
    ]) {
      expect(detectInstallationEnvironment({ userAgent })).toBe("unsupported-browser");
    }

    expect(detectInstallationEnvironment({ userAgent: CHROME_USER_AGENT, hasBraveApi: true })).toBe(
      "unsupported-browser",
    );
  });

  it("distinguishes unsupported Chrome on iOS and iPadOS", () => {
    expect(
      detectInstallationEnvironment({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe("chrome-ios");
    expect(
      detectInstallationEnvironment({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe("unsupported-browser");
  });
});

describe("InstallationProvider", () => {
  it("renders safely before client effects and begins in a neutral checking state", () => {
    expect(
      renderToString(
        <InstallationProvider>
          <Harness />
        </InstallationProvider>,
      ),
    ).toContain("checking");
  });

  it("reports supported Chrome while waiting for Chrome's deferred prompt", async () => {
    setChromeEnvironment();
    renderHarness();

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("supported-awaiting-prompt"),
    );
  });

  it("captures the prompt, prevents the mini-prompt, and installs only after a user action", async () => {
    setChromeEnvironment();
    const user = userEvent.setup();
    const prompt = vi.fn().mockResolvedValue(undefined);
    renderHarness();

    const event = installPromptEvent("accepted", prompt);
    window.dispatchEvent(event);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("installed"));
    expect(prompt).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status")).toHaveTextContent("unavailable");
  });

  it("exposes the active prompt state and handles dismissal honestly", async () => {
    setChromeEnvironment();
    const user = userEvent.setup();
    let resolvePrompt: (() => void) | undefined;
    const prompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
    );
    renderHarness();

    window.dispatchEvent(installPromptEvent("dismissed", prompt));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.getByTestId("status")).toHaveTextContent("prompting");

    resolvePrompt?.();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("dismissed"));

    const repeatedEvent = installPromptEvent("accepted", vi.fn());
    window.dispatchEvent(repeatedEvent);
    expect(repeatedEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId("status")).toHaveTextContent("dismissed");
  });

  it("detects an installed standalone launch and the appinstalled event", async () => {
    setChromeEnvironment();
    installMedia(true);
    const standalone = renderHarness();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("installed"));

    standalone.unmount();
    installMedia(false);
    renderHarness();
    window.dispatchEvent(new Event("appinstalled"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("installed"));
  });

  it("reports non-Chrome, Chrome on iOS, and prompt failures without exposing a broken prompt", async () => {
    setNavigatorValue("userAgent", `${CHROME_USER_AGENT} Edg/140.0.0.0`);
    const edge = renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unsupported-browser"),
    );

    edge.unmount();
    setNavigatorValue(
      "userAgent",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
    );
    setNavigatorValue("userAgentData", undefined);
    const ios = renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unsupported-ios-chrome"),
    );

    ios.unmount();
    setChromeEnvironment();
    const user = userEvent.setup();
    renderHarness();
    window.dispatchEvent(
      installPromptEvent("accepted", vi.fn().mockRejectedValue(new Error("no prompt"))),
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    await user.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("failure"));
  });
});
