/**
 * Guards the mobile telemetry identity contract: a signed-in account is
 * identified by its Supabase user id and email, but only through the remote
 * kill switch, so `$identify` never leaves the device while the gate is
 * closed or unknown, and it always precedes the events queued before it.
 */
import {
  createTelemetryService,
  DEFAULT_POSTHOG_HOST,
  type TelemetryAccount,
  type TelemetryConfig,
  type TelemetryTransport,
} from "./telemetry";

const enabledConfig: TelemetryConfig = {
  enabled: true,
  apiKey: "phc_test_key",
  host: DEFAULT_POSTHOG_HOST,
};

const account: TelemetryAccount = { id: "user-1", email: "person@example.com" };

function createGatedHarness() {
  const calls: string[] = [];
  let gate: ((allowed: boolean) => void) | undefined;
  const transport: TelemetryTransport = {
    captureCrash: () => undefined,
    capture: (event) => calls.push(`capture:${event}`),
    identify: (next) => calls.push(`identify:${next.id}:${next.email ?? ""}`),
    reset: () => calls.push("reset"),
    flush: async () => undefined,
    onRemoteGateChange: (listener) => {
      gate = listener;
    },
  };
  const service = createTelemetryService(enabledConfig, async () => transport);
  return { service, calls, openGate: (allowed: boolean) => gate?.(allowed) };
}

describe("mobile telemetry identity", () => {
  it("identifies the account before the events queued ahead of the gate", async () => {
    const { service, calls, openGate } = createGatedHarness();
    await service.capture("app_session_started");
    service.identify(account);
    expect(calls).toEqual([]);

    openGate(true);

    expect(calls).toEqual(["identify:user-1:person@example.com", "capture:app_session_started"]);
  });

  it("never identifies while the kill switch is closed", async () => {
    const { service, calls, openGate } = createGatedHarness();
    await service.init();
    service.identify(account);
    openGate(false);

    expect(calls).toEqual([]);
  });

  it("identifies once per account and again after a reset", async () => {
    const { service, calls, openGate } = createGatedHarness();
    await service.init();
    openGate(true);
    service.identify(account);
    service.identify(account);
    await service.reset();
    service.identify({ id: "user-2" });

    expect(calls).toEqual(["identify:user-1:person@example.com", "reset", "identify:user-2:"]);
  });

  it("sends nothing when telemetry is disabled", async () => {
    const identify = jest.fn();
    const service = createTelemetryService({ ...enabledConfig, enabled: false }, async () => ({
      captureCrash: () => undefined,
      identify,
      flush: async () => undefined,
    }));
    service.identify(account);
    await service.init();

    expect(identify).not.toHaveBeenCalled();
  });
});
