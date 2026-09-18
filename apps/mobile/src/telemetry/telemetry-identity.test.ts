/**
 * Guards the mobile telemetry identity contract: no Zoption or Supabase
 * identity may reach the vendor. `identify()` is the call that shipped the
 * Supabase subject plus the account email to PostHog, outside the remote kill
 * switch, so its absence is a security property and not an implementation
 * detail.
 */
import {
  createTelemetryService,
  DEFAULT_POSTHOG_HOST,
  telemetry,
  type SanitizedCrashReport,
  type TelemetryConfig,
} from "./telemetry";

const enabledConfig: TelemetryConfig = {
  enabled: true,
  apiKey: "phc_test_key",
  host: DEFAULT_POSTHOG_HOST,
};

describe("mobile telemetry identity", () => {
  it("exposes no identify entry point on the shipped service", () => {
    expect("identify" in telemetry).toBe(false);
  });

  it("never asks a transport to identify, even one that still offers it", async () => {
    const identify = jest.fn();
    const captured: SanitizedCrashReport[] = [];
    const transport = {
      captureCrash: (report: SanitizedCrashReport) => {
        captured.push(report);
      },
      identify,
      flush: async () => undefined,
    };
    const service = createTelemetryService(enabledConfig, async () => transport);

    await service.init();
    await service.captureException(new Error("identity probe"), "identity-test");
    await service.flush();
    await service.reset();

    expect(identify).not.toHaveBeenCalled();
    // The lifecycle above is real: the sanitized report still arrives.
    expect(captured.map((report) => report.source)).toEqual(["identity-test"]);
  });
});
