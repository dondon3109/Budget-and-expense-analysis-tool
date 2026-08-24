import { describe, expect, it } from "vitest";

import { validateMobileTelemetryEnvironment } from "./validate-mobile-telemetry-env.mjs";

describe("validateMobileTelemetryEnvironment", () => {
  it("accepts an enabled production configuration", () => {
    expect(
      validateMobileTelemetryEnvironment({
        EXPO_PUBLIC_POSTHOG_KEY: "phc_project_key",
        EXPO_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      }),
    ).toEqual({ enabled: true, host: "https://us.i.posthog.com" });
  });

  it("accepts an explicit hard-disable without a key", () => {
    expect(validateMobileTelemetryEnvironment({ EXPO_PUBLIC_TELEMETRY_DISABLED: "true" })).toEqual({
      enabled: false,
      host: undefined,
    });
    expect(validateMobileTelemetryEnvironment({ EXPO_PUBLIC_TELEMETRY_DISABLED: "TRUE" })).toEqual({
      enabled: false,
      host: undefined,
    });
  });

  it("rejects a missing or malformed key without exposing its value", () => {
    expect(() => validateMobileTelemetryEnvironment({})).toThrow(
      "EXPO_PUBLIC_POSTHOG_KEY is required",
    );
    const malformed = "personal-secret-value";
    let message = "";
    try {
      validateMobileTelemetryEnvironment({
        EXPO_PUBLIC_POSTHOG_KEY: malformed,
        EXPO_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("project API key");
    expect(message).not.toContain(malformed);
  });

  it("rejects a missing or unknown ingestion host", () => {
    expect(() =>
      validateMobileTelemetryEnvironment({ EXPO_PUBLIC_POSTHOG_KEY: "phc_project_key" }),
    ).toThrow("EXPO_PUBLIC_POSTHOG_HOST");
    expect(() =>
      validateMobileTelemetryEnvironment({
        EXPO_PUBLIC_POSTHOG_KEY: "phc_project_key",
        EXPO_PUBLIC_POSTHOG_HOST: "https://example.com",
      }),
    ).toThrow("EXPO_PUBLIC_POSTHOG_HOST");
  });

  it("rejects ambiguous hard-disable values", () => {
    expect(() =>
      validateMobileTelemetryEnvironment({ EXPO_PUBLIC_TELEMETRY_DISABLED: "yes" }),
    ).toThrow("must be empty, 0, 1, false, or true");
  });
});
