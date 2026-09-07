import {
  grantMicCaptureConsent,
  MIC_CAPTURE_CONSENT_MESSAGE,
  MIC_CAPTURE_CONSENT_VERSION,
  NO_STORE_USER_COPY,
  parsePersistedMicCaptureConsent,
  requiresMicCaptureConsent,
} from "./mic-capture-consent";

describe("mic-capture consent gate (separate from assistant-voice consent)", () => {
  it("requires consent when there is no record", () => {
    expect(requiresMicCaptureConsent(null)).toBe(true);
  });

  it("requires consent when never granted", () => {
    expect(requiresMicCaptureConsent({ consentedAt: null, consentVersion: 0 })).toBe(true);
  });

  it("requires re-consent for older notice versions", () => {
    expect(
      requiresMicCaptureConsent({
        consentedAt: "2026-08-01T00:00:00.000Z",
        consentVersion: MIC_CAPTURE_CONSENT_VERSION - 1,
      }),
    ).toBe(true);
  });

  it("accepts a grant at the current version", () => {
    const granted = grantMicCaptureConsent(new Date("2026-09-07T00:00:00.000Z"));
    expect(granted.consentVersion).toBe(MIC_CAPTURE_CONSENT_VERSION);
    expect(granted.consentedAt).toBe("2026-09-07T00:00:00.000Z");
    expect(requiresMicCaptureConsent(granted)).toBe(false);
  });

  it("fails closed for malformed persisted state", () => {
    expect(parsePersistedMicCaptureConsent("garbage")).toBe(null);
    expect(parsePersistedMicCaptureConsent({ consentedAt: "not-a-version" })).toBe(null);
    expect(
      parsePersistedMicCaptureConsent({ consentedAt: null, consentVersion: -1 }),
    ).toBe(null);
    expect(
      parsePersistedMicCaptureConsent({
        consentedAt: "2026-09-07T00:00:00.000Z",
        consentVersion: MIC_CAPTURE_CONSENT_VERSION,
      }),
    ).toEqual({
      consentedAt: "2026-09-07T00:00:00.000Z",
      consentVersion: MIC_CAPTURE_CONSENT_VERSION,
    });
  });

  it("states the no-store guarantee in user-facing copy", () => {
    expect(NO_STORE_USER_COPY).toMatch(/never stored/i);
    expect(MIC_CAPTURE_CONSENT_MESSAGE).toContain(NO_STORE_USER_COPY);
  });
});
