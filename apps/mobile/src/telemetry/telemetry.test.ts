import {
  CRASH_EVENT_NAME,
  createTelemetryService,
  crashFingerprint,
  DEFAULT_POSTHOG_HOST,
  extractErrorName,
  forwardUncaughtErrors,
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

  it("is deterministic per failure and distinct across failures", () => {
    // The fingerprint hashes name+message+stack: an identical recurring
    // failure (same stack) must group; different messages must not.
    const error = new Error("boom");
    const first = sanitizeError(error, "src");
    const again = sanitizeError(error, "src");
    const recurring = sanitizeError(
      Object.assign(new Error("boom"), { stack: error.stack }),
      "src",
    );
    const otherMessage = sanitizeError(new Error("different"), "src");
    const otherSource = sanitizeError(error, "elsewhere");
    expect(again.fingerprint).toBe(first.fingerprint);
    expect(recurring.fingerprint).toBe(first.fingerprint);
    expect(otherMessage.fingerprint).not.toBe(first.fingerprint);
    expect(otherSource.fingerprint).toBe(first.fingerprint); // source is not hashed
  });

  it("reduces non-Error throws to safe generic types", () => {
    expect(sanitizeError("plain string rejection", "s").type).toBe("ThrownString");
    expect(sanitizeError(null, "s").type).toBe("ThrownVoid");
    expect(sanitizeError(undefined, "s").type).toBe("ThrownVoid");
    expect(sanitizeError({ code: 7 }, "s").type).toBe("NonError");
    const named = Object.assign(new Error("x"), { name: "ApiFailure" });
    expect(sanitizeError(named, "s").type).toBe("ApiFailure");
  });

  it("caps and cleans hostile token content", () => {
    expect(normalizeCrashToken("TypeError\u0000\u{1F4A9} <script>", 64)).toBe("TypeError-script");
    const report = sanitizeError(new Error("x"), "source/with\u0000weird*chars!!");
    expect(report.source).toMatch(/^[A-Za-z0-9_.-]{1,48}$/);
    const longName = Object.assign(new Error("x"), { name: "E".repeat(200) });
    expect(sanitizeError(longName, "s").type).toHaveLength(64);
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

interface GateableTransport extends TelemetryTransport {
  notifyGate(allowed: boolean): void;
}

describe("createTelemetryService", () => {
  interface Harness {
    service: ReturnType<typeof createTelemetryService>;
    transports: GateableTransport[];
    captured: SanitizedCrashReport[];
    flushCalls: number;
  }

  function createHarness(options: { gated?: boolean; failDelivery?: boolean } = {}): Harness {
    const transports: GateableTransport[] = [];
    const captured: SanitizedCrashReport[] = [];
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
        flush: () => {
          flushCalls += 1;
          return Promise.reject(new Error("network gone"));
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

  it("flushes each sanitized report for immediate delivery", async () => {
    const harness = createHarness();
    await harness.service.init();
    await harness.service.captureException(new Error("x"), "root-error-boundary");
    // Render errors can take the process down, so the service must not wait
    // for the batcher's normal schedule.
    expect(harness.flushCalls).toBe(1);
  });

  it("swallows delivery failures so telemetry never compounds errors", async () => {
    const harness = createHarness({ failDelivery: true });
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

  it("survives throwing reporters and throwing previous handlers", () => {
    const state = install(() => {
      throw new Error("previous handler bug");
    });
    forwardUncaughtErrors(() => {
      throw new Error("reporter bug");
    });
    const handler = state.handler;
    if (!handler) throw new Error("handler was not installed");
    expect(() => handler(new Error("boom"), false)).not.toThrow();
  });

  it("does nothing where no global handler mechanism exists", () => {
    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
    expect(() => forwardUncaughtErrors(() => undefined)).not.toThrow();
  });
});
