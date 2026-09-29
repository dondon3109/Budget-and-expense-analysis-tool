// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CONSENT_STORAGE_KEY } from "@zoption/web-common/consent";
import { readConsentRecord } from "@zoption/web-common/consent-storage";
import { resetConsentGateForTests } from "@zoption/web-common/consent-gate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setupConsent, setupFilters, setupPricingInterval } from "../src/client/site";
import { CookieConsent } from "../src/components/consent/CookieConsent";
import { PricingPage } from "../src/views/pricing/PricingPage";
import { TutorialsPage } from "../src/views/tutorials/TutorialsPage";

// jsdom has no modal dialog support; the browser's showModal/close only toggle `open`.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetConsentGateForTests();
});

describe("pricing interval toggle", () => {
  it("switches the prices on show and the checked radio", async () => {
    const user = userEvent.setup();
    const { container } = render(<PricingPage />);
    setupPricingInterval();

    await user.click(screen.getByRole("radio", { name: /Annual billing/i }));

    expect(container.querySelector("[data-active-interval]")).toHaveAttribute(
      "data-active-interval",
      "year",
    );
    expect(screen.getByRole("radio", { name: /Annual billing/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Monthly billing/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

describe("tutorial search", () => {
  it("narrows by text and category, shows the empty state, and resets", async () => {
    const user = userEvent.setup();
    render(<TutorialsPage />);
    setupFilters();
    const list = document.querySelector<HTMLElement>("[data-filter-items='tutorials']")!;
    const visibleCards = () => within(list).queryAllByRole("article");
    const total = visibleCards().length;

    await user.type(screen.getByRole("searchbox", { name: "Search tutorials" }), "receipt");
    expect(visibleCards().length).toBeGreaterThan(0);
    expect(visibleCards().length).toBeLessThan(total);

    await user.type(screen.getByRole("searchbox", { name: "Search tutorials" }), "zzzz");
    expect(visibleCards()).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "No tutorials found" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(visibleCards()).toHaveLength(total);
    expect(screen.getByRole("searchbox", { name: "Search tutorials" })).toHaveValue("");
  });
});

describe("cookie consent", () => {
  it("shows the banner until a decision, then records it in the shared consent record", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);
    setupConsent();

    const banner = screen.getByRole("complementary", { name: "Choose what this browser may use" });
    expect(banner).toBeVisible();

    await user.click(within(banner).getByRole("button", { name: "Reject All" }));

    expect(banner).not.toBeVisible();
    expect(readConsentRecord()?.preferences).toEqual({ analytics: false, marketing: false });
    expect(readConsentRecord()?.source).toBe("reject_all");
  });

  it("saves custom preferences from the dialog", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);
    setupConsent();

    await user.click(screen.getByRole("button", { name: "Manage Preferences" }));
    await user.click(screen.getByRole("checkbox", { name: "Allow Analytics storage" }));
    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    expect(readConsentRecord()?.preferences).toEqual({ analytics: true, marketing: false });
    expect(readConsentRecord()?.source).toBe("custom");
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("keeps the banner hidden once this browser has decided", () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        policyVersion: "2026-07-28",
        decidedAt: "2026-09-01T00:00:00.000Z",
        source: "accept_all",
        preferences: { analytics: true, marketing: true },
      }),
    );
    render(<CookieConsent />);
    setupConsent();

    expect(document.querySelector("[data-consent-banner]")).not.toBeVisible();
  });
});
