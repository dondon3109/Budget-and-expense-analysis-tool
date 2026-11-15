// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_STORAGE_KEY,
  createConsentRecord,
  type ConsentPreferences,
} from "@zoption/web-common/consent";
import { persistConsentRecord, readConsentRecord } from "@zoption/web-common/consent-storage";
import { CookieConsentProvider, useCookieConsent } from "../src/consent/CookieConsentProvider";
import { resetConsentGateForTests } from "@zoption/web-common/consent-gate";

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
      <button type="button" onClick={() => consent.closePreferences()}>
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
    expect(readConsentRecord()).toMatchObject({
      source: "accept_all",
      preferences: { analytics: true, marketing: true },
    });

    await user.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByTestId("preferences")).toHaveTextContent("true:false");
  });

  it("keeps the current-tab decision when the browser refuses the cookie", async () => {
    vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => {});
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(screen.getByTestId("decision")).toHaveTextContent("decided");
    expect(screen.getByTestId("preferences")).toHaveTextContent("false:false");
  });

  it("picks up a decision made on the public site or another tab when it regains focus", () => {
    renderProvider();
    const record = createConsentRecord(
      { analytics: false, marketing: true },
      "custom",
      "2026-07-28T09:00:00.000Z",
    );

    persistConsentRecord(record);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("decision")).toHaveTextContent("decided");
    expect(screen.getByTestId("preferences")).toHaveTextContent("false:true");

    document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(
      JSON.stringify({ ...record, policyVersion: "stale" }),
    )}; Path=/`;
    act(() => {
      window.dispatchEvent(new Event("focus"));
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
