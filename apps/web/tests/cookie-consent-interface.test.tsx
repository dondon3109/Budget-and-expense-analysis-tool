// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { CookieConsentExperience } from "../src/components/consent/CookieConsentExperience";
import { ThemeChoiceDialog } from "../src/components/theme/ThemeChoiceDialog";
import { CONSENT_STORAGE_KEY, createConsentRecord } from "../src/consent/consent";
import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { resetConsentGateForTests } from "../src/consent/consentGate";
import { THEME_STORAGE_KEY, ThemeProvider } from "../src/theme/ThemeProvider";

function renderExperience(initialEntries = ["/"], onUnderlyingAction?: () => void) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Test root is missing.");

  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <button type="button" onClick={onUnderlyingAction}>
            Underlying action
          </button>
          <CookieConsentExperience />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
    { container: root },
  );
}

function renderFirstVisit() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Test root is missing.");

  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={["/"]}>
          <ThemeChoiceDialog />
          <CookieConsentExperience />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
    { container: root },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  cleanup();
  resetConsentGateForTests();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cookie consent interface", () => {
  it("waits until the mandatory theme choice has been completed", () => {
    renderExperience();

    expect(screen.queryByRole("heading", { name: "Choose what this browser may use" })).toBeNull();
  });

  it("offers equally prominent Accept All and Reject All actions", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderExperience();

    const accept = screen.getByRole("button", { name: "Accept All" });
    const reject = screen.getByRole("button", { name: "Reject All" });
    expect(accept).toHaveClass("primary");
    expect(reject).toHaveClass("primary");
    const cookiePolicy = screen.getByRole("link", { name: "Cookie Policy" });
    expect(cookiePolicy).toHaveAttribute("href", "/cookie-policy");
    expect(cookiePolicy).toHaveAttribute("target", "_blank");
    expect(cookiePolicy).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps the page readable, scrollable and clickable while the bar is pending", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    const onUnderlyingAction = vi.fn();
    renderExperience(["/"], onUnderlyingAction);

    const banner = screen.getByRole("complementary", {
      name: "Choose what this browser may use",
    });
    expect(banner).toBeVisible();
    expect(banner).not.toHaveAttribute("aria-modal");
    expect(document.querySelector(".cookie-consent-backdrop")).toBeNull();
    expect(document.getElementById("root")?.inert).not.toBe(true);
    expect(document.getElementById("root")).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");

    await user.click(screen.getByRole("button", { name: "Underlying action" }));

    expect(onUnderlyingAction).toHaveBeenCalledTimes(1);
    expect(banner).toBeVisible();
  });

  it("shows the non-modal bar after the theme dialog is dismissed with Escape", async () => {
    const user = userEvent.setup();
    renderFirstVisit();

    expect(screen.getByRole("dialog", { name: "Choose how Zoption looks" })).toBeVisible();
    expect(document.getElementById("root")?.inert).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(
      screen.getByRole("complementary", { name: "Choose what this browser may use" }),
    ).toBeVisible();
    expect(document.getElementById("root")?.inert).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("rejects optional categories and closes the first-visit banner", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole("button", { name: "Reject All" }));

    expect(screen.queryByRole("heading", { name: "Choose what this browser may use" })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null")).toMatchObject({
      source: "reject_all",
      preferences: { analytics: false, marketing: false },
    });
  });

  it("supports custom preferences while keeping Necessary immutable", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole("button", { name: "Manage Preferences" }));

    const dialog = screen.getByRole("dialog", { name: "Cookie and storage preferences" });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Necessary storage is always on" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Necessary storage is always on" })).toBeDisabled();
    const analytics = screen.getByRole("checkbox", { name: "Allow Analytics storage" });
    expect(analytics).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Allow Marketing storage" })).not.toBeChecked();
    expect(document.getElementById("root")?.inert).toBe(true);

    await user.click(analytics);
    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null")).toMatchObject({
      source: "custom",
      preferences: { analytics: true, marketing: false },
    });
    expect(document.getElementById("root")?.inert).toBe(false);
  });

  it("closes preferences before opening the Cookie Policy", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole("button", { name: "Manage Preferences" }));
    await user.click(screen.getByRole("link", { name: "Cookie Policy" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("root")?.inert).toBe(false);
    expect(screen.queryByRole("heading", { name: "Choose what this browser may use" })).toBeNull();
  });

  it("traps focus, closes with Escape, and restores the trigger focus", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    renderExperience();

    const trigger = screen.getByRole("button", { name: "Manage Preferences" });
    await user.click(trigger);
    const close = screen.getByRole("button", { name: "Close cookie preferences" });
    await waitFor(() => expect(close).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save Preferences" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Manage Preferences" })).toHaveFocus(),
    );
  });

  it.each(["/cookie-policy", "/privacy-policy", "/terms-of-service"])(
    "does not show the first-visit banner on %s",
    (path) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "light");
      renderExperience([path]);

      expect(
        screen.queryByRole("heading", { name: "Choose what this browser may use" }),
      ).toBeNull();
    },
  );

  it("does not show the first-visit banner for a current saved decision", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "coffee");
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify(
        createConsentRecord(
          { analytics: false, marketing: false },
          "reject_all",
          "2026-07-28T09:00:00.000Z",
        ),
      ),
    );

    renderExperience();

    expect(screen.queryByRole("heading", { name: "Choose what this browser may use" })).toBeNull();
  });
});
