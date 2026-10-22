// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_POLICY_VERSION,
  CONSENT_SCHEMA_VERSION,
  CONSENT_STORAGE_KEY,
  createConsentRecord,
} from "../src/consent/consent";
import {
  parseConsentRecord,
  persistConsentRecord,
  readConsentRecord,
} from "../src/consent/consentStorage";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("consent storage", () => {
  it("round-trips a current versioned record through the consent cookie", () => {
    const record = createConsentRecord(
      { analytics: true, marketing: false },
      "custom",
      "2026-07-28T09:00:00.000Z",
    );

    expect(persistConsentRecord(record)).toBe(true);
    expect(document.cookie).toContain(`${CONSENT_STORAGE_KEY}=`);
    expect(readConsentRecord()).toEqual(record);
  });

  it("moves a decision stored before the cookie into it and drops the old copy", () => {
    const record = createConsentRecord(
      { analytics: true, marketing: true },
      "accept_all",
      "2026-10-18T09:00:00.000Z",
    );
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));

    expect(readConsentRecord()).toEqual(record);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(readConsentRecord()).toEqual(record);
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "an old schema",
      JSON.stringify({
        schemaVersion: CONSENT_SCHEMA_VERSION - 1,
        policyVersion: CONSENT_POLICY_VERSION,
        decidedAt: "2026-07-28T09:00:00.000Z",
        source: "reject_all",
        preferences: { analytics: false, marketing: false },
      }),
    ],
    [
      "a stale policy",
      JSON.stringify({
        schemaVersion: CONSENT_SCHEMA_VERSION,
        policyVersion: "2025-01-01",
        decidedAt: "2026-07-28T09:00:00.000Z",
        source: "reject_all",
        preferences: { analytics: false, marketing: false },
      }),
    ],
    [
      "non-boolean categories",
      JSON.stringify({
        schemaVersion: CONSENT_SCHEMA_VERSION,
        policyVersion: CONSENT_POLICY_VERSION,
        decidedAt: "2026-07-28T09:00:00.000Z",
        source: "custom",
        preferences: { analytics: "yes", marketing: false },
      }),
    ],
  ])("fails closed for %s", (_label, value) => {
    document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(value)}; Path=/`;

    expect(readConsentRecord()).toBeNull();
  });

  it("fails closed when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(readConsentRecord()).toBeNull();
  });

  it("reports a refused cookie without throwing", () => {
    vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => {});

    expect(
      persistConsentRecord(
        createConsentRecord({ analytics: false, marketing: false }, "reject_all"),
      ),
    ).toBe(false);
  });

  it("rejects records with invalid decision metadata", () => {
    expect(
      parseConsentRecord(
        JSON.stringify({
          schemaVersion: CONSENT_SCHEMA_VERSION,
          policyVersion: CONSENT_POLICY_VERSION,
          decidedAt: "not-a-date",
          source: "implicit",
          preferences: { analytics: false, marketing: false },
        }),
      ),
    ).toBeNull();
  });
});
