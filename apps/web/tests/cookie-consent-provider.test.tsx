// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_STORAGE_KEY,
  createConsentRecord,
  type ConsentPreferences,
} from "../src/consent/consent";
import { CookieConsentProvider, useCookieConsent } from "../src/consent/CookieConsentProvider";
import { resetConsentGateForTests } from "../src/consent/consentGate";

function ConsentProbe() {
  const consent = useCookieConsent();

  return (
    <div>
      <span data-testid="decision">{consent.hasDecision ? "decided" : "undecided"}</span>
      <span data-testid="preferences">
        {String(consent.preferences.analytics)}:{String(consent.preferences.marketing)}
      </span>
      <span data-testid="dialog">{consent.preferencesOpen ? "open" : "closed"}</span>
      <button type="button" onClick={consent.acceptAll}>
        Accept
      </button>
      <button type="button" onClick={consent.rejectAll}>
        Reject
      </button>
      <button type="button" onClick={() => consent.savePreferences(customPreferences)}>
        Custom
      </button>
      <button type="button" onClick={() => consent.openPreferences()}>
        Open
      </button>
      <button type="button" onClick={consent.closePreferences}>
        Close
      </button>
    </div>
  );
}

const customPreferences: ConsentPreferences = { analytics: true, marketing: false };

function renderProvider() {
  return render(
    <CookieConsentProvider>
      <ConsentProbe />
    </CookieConsentProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetConsentGateForTests();
  vi.restoreAllMocks();
});

describe("CookieConsentProvider", () => {
  it("starts undecided and fails closed", () => {
    renderProvider();

    expect(screen.getByTestId("decision")).toHaveTextContent("undecided");
    expect(screen.getByTestId("preferences")).toHaveTextContent("false:false");
  });

  it("persists Accept All and custom decisions", async () => {
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByTestId("preferences")).toHaveTextContent("true:true");
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null")).toMatchObject({
      source: "accept_all",
      preferences: { analytics: true, marketing: true },
    });

    await user.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByTestId("preferences")).toHaveTextContent("true:false");
  });

  it("keeps the current-tab decision when storage persistence fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(screen.getByTestId("decision")).toHaveTextContent("decided");
    expect(screen.getByTestId("preferences")).toHaveTextContent("false:false");
  });

  it("synchronizes valid decisions and stale-policy resets from another tab", () => {
    renderProvider();
    const record = createConsentRecord(
      { analytics: false, marketing: true },
      "custom",
      "2026-07-28T09:00:00.000Z",
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: CONSENT_STORAGE_KEY,
          newValue: JSON.stringify(record),
        }),
      );
    });
    expect(screen.getByTestId("decision")).toHaveTextContent("decided");
    expect(screen.getByTestId("preferences")).toHaveTextContent("false:true");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: CONSENT_STORAGE_KEY,
          newValue: JSON.stringify({ ...record, policyVersion: "stale" }),
        }),
      );
    });
    expect(screen.getByTestId("decision")).toHaveTextContent("undecided");
    expect(screen.getByTestId("preferences")).toHaveTextContent("false:false");
  });

  it("opens and closes preferences independently of the decision", async () => {
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("dialog")).toHaveTextContent("open");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("dialog")).toHaveTextContent("closed");
  });
});
