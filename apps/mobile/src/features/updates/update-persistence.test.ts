import {
  parseUpdatePersistence,
  shouldShowAutomaticPrompt,
  shouldSkipAutomaticCheck,
} from "./update-persistence";

describe("update persistence", () => {
  it("fails closed for malformed stored state", () => {
    expect(parseUpdatePersistence({ lastSuccessfulCheckAt: "yesterday" })).toEqual({
      lastSuccessfulCheckAt: 0,
      reserved: null,
    });
  });

  it("restores a reserved installer file", () => {
    expect(
      parseUpdatePersistence({
        lastSuccessfulCheckAt: 10,
        reservedApkUri: "file:///cache/apk-updates/zoption-20301.apk",
        reservedUntil: 99,
      }),
    ).toEqual({
      lastSuccessfulCheckAt: 10,
      reserved: {
        uri: "file:///cache/apk-updates/zoption-20301.apk",
        reservedUntil: 99,
      },
    });
  });

  it("throttles only recent successful automatic checks", () => {
    expect(shouldSkipAutomaticCheck({ lastSuccessfulCheckAt: 0, now: 1000, intervalMs: 500 })).toBe(
      false,
    );
    expect(
      shouldSkipAutomaticCheck({ lastSuccessfulCheckAt: 800, now: 1000, intervalMs: 500 }),
    ).toBe(true);
    expect(
      shouldSkipAutomaticCheck({ lastSuccessfulCheckAt: 100, now: 1000, intervalMs: 500 }),
    ).toBe(false);
  });

  it("does not automatically re-prompt a dismissed version", () => {
    expect(shouldShowAutomaticPrompt({ versionCode: 20301, dismissedVersionCode: 20301 })).toBe(
      false,
    );
    expect(shouldShowAutomaticPrompt({ versionCode: 20302, dismissedVersionCode: 20301 })).toBe(
      true,
    );
  });
});
