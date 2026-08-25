import {
  CRASH_EVENT_NAME,
  createPostHogOptions,
  createTelemetryService,
  crashFingerprint,
  DEFAULT_POSTHOG_HOST,
  extractErrorName,
  forwardUncaughtErrors,
  normalizedStackShape,
  normalizeCrashToken,
  parseTelemetryConfig,
  REMOTE_KILL_SWITCH_FLAG,
  sanitizeError,
  type SanitizedCrashReport,
  type TelemetryConfig,
  type TelemetryTransport,
} from "./telemetry";

const enabledConfig: TelemetryConfig = {
  enabled: true,
  apiKey: "phc_test_key",
  host: DEFAULT_POSTHOG_HOST,
};

describe("parseTelemetryConfig", () => {
  it("stays disabled without an API key", () => {
    expect(parseTelemetryConfig(undefined, undefined, undefined)).toEqual({
      enabled: false,
      apiKey: undefined,
      host: DEFAULT_POSTHOG_HOST,
    });
    expect(parseTelemetryConfig("  ", undefined, undefined).enabled).toBe(false);
  });

  it("enables with a key and defaults to the US PostHog host", () => {
    const config = parseTelemetryConfig("phc_key", undefined, undefined);
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("phc_key");
    expect(config.host).toBe(DEFAULT_POSTHOG_HOST);
  });

  it("honors a custom regional host", () => {
    expect(parseTelemetryConfig("phc_key", "https://eu.i.posthog.com", undefined).host).toBe(
      "https://eu.i.posthog.com",
    );
  });

  it("lets the explicit build-time kill switch win over a present key", () => {
    expect(parseTelemetryConfig("phc_key", undefined, "1").enabled).toBe(false);
    expect(parseTelemetryConfig("phc_key", undefined, "true").enabled).toBe(false);
    expect(parseTelemetryConfig("phc_key", undefined, "TRUE").enabled).toBe(false);
    expect(parseTelemetryConfig("phc_key", undefined, "0").enabled).toBe(true);
  });
});

describe("sanitizeError", () => {
  it("never transmits raw messages or stacks", () => {
    const error = new Error("transfer to acct=ZEN-4242 failed, server said overdraft");
    const report = sanitizeError(error, "root-error-boundary");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("acct=ZEN-4242");
    expect(serialized).not.toContain("overdraft");
    expect(report.type).toBe("Error");
    expect(report.source).toBe("root-error-boundary");
    expect(report.fingerprint).toMatch(/^[0-9a-z]{14}$/);
  });

  it("groups by message-free stack shape", () => {
    const firstError = Object.assign(new Error("acct=ZEN-1"), {
      stack:
        "Error: acct=ZEN-1\n    at submit (/app/entry.ts:10:20)\n    at root (/app/root.ts:30:40)",
    });
    const sameFramesDifferentMessage = Object.assign(new Error("acct=OTHER"), {
      stack:
        "Error: acct=OTHER\n    at submit (/app/entry.ts:99:7)\n    at root (/app/root.ts:31:2)",
    });
    const differentFrames = Object.assign(new Error("acct=ZEN-1"), {
      stack: "Error: acct=ZEN-1\n    at sync (/app/sync.ts:10:20)",
    });
    const first = sanitizeError(firstError, "src");
    const again = sanitizeError(firstError, "src");
    const recurring = sanitizeError(sameFramesDifferentMessage, "src");
    const otherFailure = sanitizeError(differentFrames, "src");
    const otherSource = sanitizeError(firstError, "elsewhere");
    expect(again.fingerprint).toBe(first.fingerprint);
    expect(recurring.fingerprint).toBe(first.fingerprint);
    expect(otherFailure.fingerprint).not.toBe(first.fingerprint);
    expect(otherSource.fingerprint).toBe(first.fingerprint); // source is not hashed
    expect(normalizedStackShape(firstError)).not.toContain("ZEN-1");
  });

  it("reduces non-Error throws to safe generic types", () => {
    expect(sanitizeError("plain string rejection", "s").type).toBe("ThrownString");
    expect(sanitizeError(null, "s").type).toBe("ThrownVoid");
    expect(sanitizeError(undefined, "s").type).toBe("ThrownVoid");
    expect(sanitizeError({ code: 7 }, "s").type).toBe("NonError");
    const named = Object.assign(new Error("x"), { name: "AccountZENError" });
    expect(sanitizeError(named, "s").type).toBe("CustomError");
  });

  it("caps and cleans hostile token content", () => {
    expect(normalizeCrashToken("TypeError\u0000\u{1F4A9} <script>", 64)).toBe("TypeError-script");
    const report = sanitizeError(new Error("x"), "source/with\u0000weird*chars!!");
    expect(report.source).toMatch(/^[A-Za-z0-9_.-]{1,48}$/);
    const longName = Object.assign(new Error("x"), { name: "E".repeat(200) });
    expect(sanitizeError(longName, "s").type).toBe("CustomError");
  });
});

describe("crashFingerprint and extractErrorName", () => {
  it("hashes stably but differently for different inputs", () => {
    expect(crashFingerprint("same")).toBe(crashFingerprint("same"));
    expect(crashFingerprint("same")).not.toBe(crashFingerprint("other"));
    expect(extractErrorName(new TypeError("t"))).toBe("TypeError");
    expect(extractErrorName(42)).toBe("NonError");
  });
});

describe("createPostHogOptions", () => {
  it("uses ephemeral SDK defaults with profiles only for identified users", () => {
    const options = createPostHogOptions("https://eu.i.posthog.com");
    expect(options).toMatchObject({
      host: "https://eu.i.posthog.com",
      persistence: "memory",
      personProfiles: "identified_only",
      setDefaultPersonProperties: false,
      disableSurveys: true,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
    });
    expect(options.customAppProperties()).toEqual({});
    expect(options.errorTracking.autocapture).toEqual({
      uncaughtExceptions: false,
      unhandledRejections: false,
      console: false,
      nativeCrashes: false,
    });
  });
});

interface GateableTransport extends TelemetryTransport {
  notifyGate(allowed: boolean): void;
}

describe("createTelemetryService", () => {
  interface Harness {
    service: ReturnType<typeof createTelemetryService>;
    transports: GateableTransport[];
    captured: SanitizedCrashReport[];
    identified: Array<{ distinctId: string; personProperties?: { email?: string } }>;
    resetCalls: number;
    flushCalls: number;
  }

  function createHarness(
    options: { gated?: boolean; failDelivery?: boolean; failFlush?: boolean } = {},
  ): Harness {
    const transports: GateableTransport[] = [];
    const captured: SanitizedCrashReport[] = [];
    const identified: Array<{ distinctId: string; personProperties?: { email?: string } }> = [];
    let resetCalls = 0;
    let flushCalls = 0;
    const service = createTelemetryService(enabledConfig, async (): Promise<TelemetryTransport> => {
      let listener: ((allowed: boolean) => void) | undefined;
      const transport: GateableTransport = {
        captureCrash: options.failDelivery
          ? () => {
              throw new Error("telemetry down");
            }
          : (report) => {
              captured.push(report);
            },
        identify: (distinctId, personProperties) => {
          identified.push({ distinctId, personProperties });
        },
        reset: () => {
          resetCalls += 1;
        },
        flush: () => {
          flushCalls += 1;
          return options.failFlush ? Promise.reject(new Error("network gone")) : Promise.resolve();
        },
        ...(options.gated
          ? {
              onRemoteGateChange: (callback: (allowed: boolean) => void) => {
                listener = callback;
              },
            }
          : {}),
        notifyGate: (allowed: boolean) => {
          listener?.(allowed);
        },
      };
      transports.push(transport);
      return transport;
    });
    return {
      service,
      transports,
      captured,
      identified,
      get resetCalls() {
        return resetCalls;
      },
      get flushCalls() {
        return flushCalls;
      },
    };
  }

  it("resolves init without creating anything when disabled", async () => {
    const neverFactory = createTelemetryService({ ...enabledConfig, enabled: false }, async () => {
      throw new Error("must not be called");
    });
    await expect(neverFactory.init()).resolves.toBeUndefined();
    await expect(neverFactory.captureException(new Error("x"), "s")).resolves.toBeUndefined();
    expect(neverFactory.isActive()).toBe(false);
  });

  it("creates the transport exactly once when enabled", async () => {
    const harness = createHarness(); // ungated transport: open by design
    await harness.service.init();
    await harness.service.init();
    expect(harness.transports).toHaveLength(1);
    expect(harness.service.isActive()).toBe(true);
  });

  it("shares one in-flight initialization", async () => {
    let resolveTransport: ((transport: TelemetryTransport) => void) | undefined;
    let factoryCalls = 0;
    const transportPromise = new Promise<TelemetryTransport>((resolve) => {
      resolveTransport = resolve;
    });
    const service = createTelemetryService(enabledConfig, () => {
      factoryCalls += 1;
      return transportPromise;
    });
    const first = service.init();
    const second = service.init();
    expect(factoryCalls).toBe(1);
    resolveTransport?.({ captureCrash: jest.fn(), flush: async () => undefined });
    await Promise.all([first, second]);
    expect(service.isActive()).toBe(true);
  });

  it("identifies with a stable id and person email, then resets at sign-out", async () => {
    const harness = createHarness();
    await harness.service.identify("auth-user-123", { email: "person@example.test" });
    expect(harness.identified).toEqual([
      { distinctId: "auth-user-123", personProperties: { email: "person@example.test" } },
    ]);

    await harness.service.reset();
    expect(harness.resetCalls).toBe(1);
  });

  it("flushes each sanitized report for immediate delivery", async () => {
    const harness = createHarness();
    await harness.service.init();
    await harness.service.captureException(new Error("x"), "root-error-boundary");
    // Render errors can take the process down, so the service must not wait
    // for the batcher's normal schedule.
    expect(harness.flushCalls).toBe(1);
  });

  it("swallows delivery failures so telemetry never compounds errors", async () => {
    const harness = createHarness({ failDelivery: true, failFlush: true });
    await harness.service.init();
    // Sync throw from captureCrash plus a rejected flush must both stay
    // swallowed; captureException still resolves.
    await expect(
      harness.service.captureException(new Error("render failed"), "s"),
    ).resolves.toBeUndefined();
  });

  it("transmits only sanitized fields, never raw content", async () => {
    const harness = createHarness();
    await harness.service.init();
    await harness.service.captureException(
      new Error("render failed for acct=ZEN-1"),
      "root-error-boundary",
    );
    expect(harness.captured).toHaveLength(1);
    const report = harness.captured[0];
    if (!report) throw new Error("report missing");
    expect(Object.keys(report).sort()).toEqual(["fingerprint", "source", "type"]);
    expect(report.source).toBe("root-error-boundary");
    expect(report.type).toBe("Error");
    expect(JSON.stringify(harness.captured)).not.toContain("acct=ZEN-1");
    expect(JSON.stringify(harness.captured)).not.toContain("render failed");
  });

  it("stays inert when transport creation fails (fail-safe init)", async () => {
    const failingAsync = createTelemetryService(enabledConfig, async () => {
      throw new Error("posthog exploded during construction");
    });
    await expect(failingAsync.init()).resolves.toBeUndefined();
    expect(failingAsync.isActive()).toBe(false);
    await expect(failingAsync.captureException(new Error("x"), "s")).resolves.toBeUndefined();

    const failingSync = createTelemetryService(enabledConfig, () => {
      throw new Error("sync constructor failure");
    });
    await expect(failingSync.init()).resolves.toBeUndefined();
    expect(failingSync.isActive()).toBe(false);
  });

  it("buffers fail-closed until the remote gate opens, then drains in order", async () => {
    const harness = createHarness({ gated: true });
    await harness.service.init();
    await harness.service.captureException(new Error("first"), "a");
    await harness.service.captureException(new Error("second"), "b");
    expect(harness.captured).toHaveLength(0); // nothing before the gate answers

    harness.transports[0]?.notifyGate(true);
    expect(harness.captured.map((report) => report.source)).toEqual(["a", "b"]);

    await harness.service.captureException(new Error("third"), "c");
    expect(harness.captured.map((report) => report.source)).toEqual(["a", "b", "c"]);
  });

  it("drops buffered and future reports when the kill switch closes", async () => {
    const harness = createHarness({ gated: true });
    await harness.service.init();
    await harness.service.captureException(new Error("held"), "a");
    harness.transports[0]?.notifyGate(false);
    await harness.service.captureException(new Error("after-close"), "b");
    expect(harness.captured).toHaveLength(0);
  });

  it("flushes transport when flush is called directly", async () => {
    const harness = createHarness();
    await harness.service.init();
    await harness.service.flush();
    expect(harness.flushCalls).toBe(1);
  });

  it("sends a sanitized test crash and flushes without crashing", async () => {
    const harness = createHarness();
    const sent = await harness.service.sendTestCrash("developer-test-action");
    expect(sent).toBe(true);
    expect(harness.captured).toHaveLength(1);
    expect(harness.captured[0]?.source).toBe("developer-test-action");
    expect(harness.captured[0]?.type).toBe("CustomError");
    expect(harness.captured[0]?.fingerprint).toMatch(/^[0-9a-z]{14}$/);
    expect(harness.flushCalls).toBeGreaterThanOrEqual(1);
  });

  it("returns false from sendTestCrash when telemetry is disabled", async () => {
    const disabledService = createTelemetryService(
      { ...enabledConfig, enabled: false },
      async () => {
        throw new Error("must not be called");
      },
    );
    const sent = await disabledService.sendTestCrash();
    expect(sent).toBe(false);
  });

  it("returns false from sendTestCrash until the remote gate opens", async () => {
    const harness = createHarness({ gated: true });
    expect(await harness.service.sendTestCrash()).toBe(false);
    expect(harness.captured).toHaveLength(0);

    harness.transports[0]?.notifyGate(false);
    expect(await harness.service.sendTestCrash()).toBe(false);
    expect(harness.captured).toHaveLength(0);

    harness.transports[0]?.notifyGate(true);
    expect(await harness.service.sendTestCrash()).toBe(true);
    expect(harness.captured).toHaveLength(1);
  });

  it("returns false from sendTestCrash when delivery or initialization fails", async () => {
    const failedCapture = createHarness({ failDelivery: true });
    expect(await failedCapture.service.sendTestCrash()).toBe(false);

    const failedFlush = createHarness({ failFlush: true });
    expect(await failedFlush.service.sendTestCrash()).toBe(false);

    const failedInit = createTelemetryService(enabledConfig, async () => {
      throw new Error("PostHog unavailable");
    });
    expect(await failedInit.sendTestCrash()).toBe(false);
  });

  it("keeps the documented event name and flag constant in sync", () => {
    expect(CRASH_EVENT_NAME).toBe("mobile_crash");
    expect(REMOTE_KILL_SWITCH_FLAG).toBe("crash-telemetry-enabled");
  });
});

describe("forwardUncaughtErrors", () => {
  function install(previousHandler: ((error: unknown, isFatal: boolean) => void) | undefined): {
    handler: ((error: unknown, isFatal: boolean) => void) | undefined;
  } {
    const state: { handler: ((error: unknown, isFatal: boolean) => void) | undefined } = {
      handler: previousHandler,
    };
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler: () => state.handler,
      setGlobalHandler: (next: (error: unknown, isFatal: boolean) => void) => {
        state.handler = next;
      },
    };
    return state;
  }

  afterEach(() => {
    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it("reports through the sanitized pipeline and preserves the previous handler", () => {
    const previousCalls: unknown[][] = [];
    const state = install((...args: unknown[]) => {
      previousCalls.push(args);
    });
    const reported: unknown[] = [];
    forwardUncaughtErrors((error) => reported.push(error));

    const handler = state.handler;
    if (!handler) throw new Error("handler was not installed");
    const error = new Error("fatal thing");
    handler(error, true);

    expect(reported).toEqual([error]);
    expect(previousCalls).toEqual([[error, true]]);
  });

  it("survives a throwing reporter before calling the previous handler", () => {
    const previous = jest.fn();
    const state = install(previous);
    forwardUncaughtErrors(() => {
      throw new Error("reporter bug");
    });
    const handler = state.handler;
    if (!handler) throw new Error("handler was not installed");
    expect(() => handler(new Error("boom"), false)).not.toThrow();
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it("preserves a throwing previous handler", () => {
    const state = install(() => {
      throw new Error("previous handler bug");
    });
    forwardUncaughtErrors(() => undefined);
    const handler = state.handler;
    if (!handler) throw new Error("handler was not installed");
    expect(() => handler(new Error("boom"), false)).toThrow("previous handler bug");
  });

  it("does nothing where no global handler mechanism exists", () => {
    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
    expect(() => forwardUncaughtErrors(() => undefined)).not.toThrow();
  });
});
