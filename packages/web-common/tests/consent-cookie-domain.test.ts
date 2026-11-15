// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.zoption.site/signup" }

import { expect, it, vi } from "vitest";

import { createConsentRecord } from "../src/consent/consent";
import { persistConsentRecord, readConsentRecord } from "../src/consent/consentStorage";

it("scopes the consent cookie to zoption.site so the public site and the app share it", () => {
  const setCookie = vi.spyOn(Document.prototype, "cookie", "set");
  const record = createConsentRecord({ analytics: true, marketing: false }, "custom");

  expect(persistConsentRecord(record)).toBe(true);

  expect(setCookie.mock.calls[0]?.[0]).toContain("Domain=zoption.site");
  expect(setCookie.mock.calls[0]?.[0]).toContain("Secure");
  expect(readConsentRecord()).toEqual(record);
});
