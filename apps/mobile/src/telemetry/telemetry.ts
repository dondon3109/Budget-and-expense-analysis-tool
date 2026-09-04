/**
 * Operator-enabled crash telemetry for the Android Beta.
 *
 * This is NOT user opt-in: every installation built with an embedded
 * EXPO_PUBLIC_POSTHOG_KEY reports crashes unless the operator disables the
 * pipeline. Two independent gates control exactly that:
 *
 *  - Remote kill switch: the PostHog feature flag
 *    `crash-telemetry-enabled`. Absent or false closes the gate, including
 *    fail-closed before flags have loaded; nothing is ever sent while the
 *    gate is unknown or closed.
 *  - Build-time hard disable: EXPO_PUBLIC_TELEMETRY_DISABLED=1 keeps the
 *    client unconstructed in every build produced with it set. CI passes the
 *    repository variable through, so flipping it affects newly built
 *    APKs/OTAs; reaching already-installed devices requires shipping such an
 *    update.
 *
 * Privacy: raw errors NEVER leave the device. SDK exception autocapture
 * stays disabled because it would transmit raw messages and stacks, which
 * can embed transaction text, identifiers, or server responses. Custom crash
 * fields carry only a coarse exception type, a deterministic grouping token
 * derived from message-free stack frames, and the reporting source label.
 * PostHog uses the authenticated Supabase subject as its stable distinct id.
 * The session boundary supplies the optional email only as a person property;
 * raw errors, messages, and stacks are never sent. See
 * docs/mobile/security-and-privacy.md.
 */

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
/** PostHog feature flag that must be truthy for reports to leave the device. */
export const REMOTE_KILL_SWITCH_FLAG = "crash-telemetry-enabled";
/** Custom event name used for sanitized crash reports. */
export const CRASH_EVENT_NAME = "mobile_crash";

export interface TelemetryConfig {
  enabled: boolean;
  apiKey?: string;
  host: string;
}

/** Zoption-controlled crash fields; PostHog adds its minimal event envelope. */
export interface SanitizedCrashReport {
  /** Where in the app the failure was observed (developer-controlled literal). */
  source: string;
  /** Coarse exception class name, e.g. "TypeError" or "NonError". */
  type: string;
  /** Deterministic hash of type plus message-free stack-frame shape. */
  fingerprint: string;
}

/** Minimal structural surface of the PostHog client the service relies on. */
export interface TelemetryTransport {
  captureCrash(report: SanitizedCrashReport): void;
  /** Captures a product event after a completed user action. */
  capture?(event: string, properties?: Record<string, string | number | boolean>): void;
  /** Optional so existing minimal transports remain valid in tests. */
  identify?(distinctId: string, personProperties?: { email?: string }): void;
  /** Optional so existing minimal transports remain valid in tests. */
  reset?(): void;
  flush(): Promise<void>;
  /** Registers the remote kill-switch listener when the backend supports flags. */
  onRemoteGateChange?(listener: (allowed: boolean) => void): void;
}

export type TelemetryTransportFactory = (config: TelemetryConfig) => Promise<TelemetryTransport>;

export interface TelemetryService {
  /** Resolves even when initialization fails; telemetry can never block startup. */
  init(): Promise<void>;
  isActive(): boolean;
  /** Identifies the authenticated user once at the session boundary. */
  identify(distinctId: string, personProperties?: { email?: string }): Promise<void>;
  /** Clears analytics identity when the authenticated session ends. */
  reset(): Promise<void>;
  /** Best-effort product event for a completed user action; never blocks callers. */
  capture(event: string, properties?: Record<string, string | number | boolean>): Promise<void>;
  /** Best-effort sanitized report; never throws and never blocks callers. */
  captureException(error: unknown, source: string): Promise<void>;
  /** Explicitly flushes queued events to the backend. */
  flush(): Promise<void>;
  /** Safe diagnostic test action that sends a sanitized crash report without crashing the app. */
  sendTestCrash(source?: string): Promise<boolean>;
}

function environmentValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const MAX_TYPE_LENGTH = 64;
const MAX_SOURCE_LENGTH = 48;
/** Bound on the hashed input so pathological stacks cannot blow up hashing. */
const FINGERPRINT_INPUT_LIMIT = 4096;

/** Strips everything but a small safe alphabet; output may be empty. */
export function normalizeCrashToken(value: string, maxLength: number): string {
  return value
    .replace(/[^A-Za-z0-9_. -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, maxLength);
}

/** Deterministic 64-bit grouping hash rendered as 14 lowercase base36 chars. */
export function crashFingerprint(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(36).padStart(7, "0") + (h2 >>> 0).toString(36).padStart(7, "0");
}

const STANDARD_ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

/** Never forwards a caller-controlled custom error name as a telemetry field. */
export function extractErrorName(error: unknown): string {
  if (error instanceof Error) {
    return STANDARD_ERROR_NAMES.has(error.name) ? error.name : "CustomError";
  }
  if (typeof error === "string") return "ThrownString";
  if (error === null || error === undefined) return "ThrownVoid";
  return "NonError";
}

/**
 * Extracts only JavaScript stack frames. The message-bearing first line and
 * any non-frame continuation lines are discarded before hashing. Line and
 * column numbers are normalized so the same code location groups across
 * minor bundle layout changes.
 */
export function normalizedStackShape(error: unknown): string {
  if (!(error instanceof Error) || typeof error.stack !== "string") return "";
  return error.stack
    .split(/\r?\n/)
    .filter((line) => /^\s*at\s+/.test(line) || /@\S+:\d+(?::\d+)?\s*$/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/:\d+:\d+/g, ":#:#")
        .replace(/:\d+(?=\)?\s*$)/, ":#"),
    )
    .join("\n")
    .slice(0, FINGERPRINT_INPUT_LIMIT);
}

/**
 * Reduces any thrown value to the only fields that may be transmitted.
 * Messages are never read. Only message-free stack frames feed the grouping
 * fingerprint, so sensitive text embedded in an error cannot reach the
 * telemetry backend either directly or as a guessable message hash.
 */
export function sanitizeError(error: unknown, source: string): SanitizedCrashReport {
  const rawName = extractErrorName(error);
  const fingerprintInput = `${rawName}\u0000${normalizedStackShape(error)}`;
  return {
    source: normalizeCrashToken(source, MAX_SOURCE_LENGTH) || "unknown-source",
    type: normalizeCrashToken(rawName, MAX_TYPE_LENGTH) || "UnknownError",
    fingerprint: crashFingerprint(fingerprintInput),
  };
}

/**
 * Kept pure so the gating rules stay unit-testable without touching
 * process.env. An explicit disable flag always wins over a present key.
 */
export function parseTelemetryConfig(
  apiKey: string | undefined,
  host: string | undefined,
  disabled: string | undefined,
): TelemetryConfig {
  const key = environmentValue(apiKey);
  const disabledValue = environmentValue(disabled)?.toLowerCase();
  return {
    enabled: Boolean(key) && disabledValue !== "1" && disabledValue !== "true",
    apiKey: key,
    host: environmentValue(host) ?? DEFAULT_POSTHOG_HOST,
  };
}

const MAX_BUFFERED_CRASHES = 25;

/**
 * Buffers sanitized reports until BOTH the transport exists and the remote
 * gate has answered, then drains in order. If the gate closes, buffered and
 * future reports are dropped (fail-closed).
 */
export function createTelemetryService(
  config: TelemetryConfig,
  createTransport: TelemetryTransportFactory,
): TelemetryService {
  let transport: TelemetryTransport | null = null;
  let gateResolved = false;
  let gateOpen = false;
  let initializationFailed = false;
  let initialization: Promise<void> | null = null;
  let identifiedUser: { distinctId: string; personProperties?: { email?: string } } | null = null;
  const pending: SanitizedCrashReport[] = [];

  const applyIdentity = (): void => {
    if (!transport || !identifiedUser) return;
    transport.identify?.(identifiedUser.distinctId, identifiedUser.personProperties);
  };

  const deliver = (report: SanitizedCrashReport): void => {
    if (!transport) return;
    try {
      transport.captureCrash(report);
      // Render errors can take the process down; flush so the report
      // actually leaves the device instead of waiting for the batcher.
      void transport.flush().catch(() => {
        /* delivery is best-effort */
      });
    } catch {
      // Telemetry must never compound a failure it is reporting.
    }
  };

  const drainPending = (): void => {
    while (pending.length > 0) {
      const report = pending.shift();
      if (report) deliver(report);
    }
  };

  return {
    init() {
      if (!config.enabled || transport || initializationFailed) return Promise.resolve();
      if (initialization) return initialization;
      initialization = (async () => {
        try {
          const created = await createTransport(config);
          transport = created;
          applyIdentity();
          if (typeof created.onRemoteGateChange === "function") {
            created.onRemoteGateChange((allowed) => {
              gateResolved = true;
              gateOpen = allowed;
              if (allowed) drainPending();
              else pending.length = 0;
            });
          } else {
            // Transport opted out of remote gating entirely (tests/simple sinks).
            gateResolved = true;
            gateOpen = true;
          }
        } catch {
          // Fail-safe: a broken telemetry backend must never affect the app.
          initializationFailed = true;
          pending.length = 0;
          transport = null;
        }
      })();
      return initialization;
    },
    isActive: () => transport !== null,
    async identify(distinctId, personProperties) {
      if (!config.enabled || !distinctId) return;
      const alreadyInitialized = transport !== null;
      identifiedUser = { distinctId, personProperties };
      await this.init();
      if (alreadyInitialized) {
        try {
          applyIdentity();
        } catch {
          // Identification must never interfere with a completed authentication flow.
        }
      }
    },
    reset() {
      identifiedUser = null;
      try {
        transport?.reset?.();
      } catch {
        // Analytics cleanup must never prevent a completed sign-out.
      }
      return Promise.resolve();
    },
    async capture(event, properties) {
      if (!config.enabled || initializationFailed) return;
      await this.init();
      try {
        transport?.capture?.(event, properties);
      } catch {
        // Product analytics must never interfere with the completed action.
      }
    },
    // Synchronous internally (delivery is fire-and-forget); the Promise keeps
    // the awaited contract callers rely on.
    captureException(error: unknown, source: string): Promise<void> {
      if (!config.enabled) return Promise.resolve();
      const report = sanitizeError(error, source);
      if (initializationFailed) return Promise.resolve();
      if (!transport || !gateResolved) {
        // Hold at most a bounded window of reports while the remote gate is
        // still unresolved (or init is still importing its backend).
        if (pending.length >= MAX_BUFFERED_CRASHES) pending.shift();
        pending.push(report);
        return Promise.resolve();
      }
      if (gateOpen) deliver(report);
      return Promise.resolve();
    },
    flush(): Promise<void> {
      if (!transport) return Promise.resolve();
      return transport.flush().catch(() => {});
    },
    async sendTestCrash(source = "developer-test-action"): Promise<boolean> {
      if (!config.enabled) return false;
      await this.init();
      if (!transport || !gateResolved || !gateOpen) return false;
      const testError = Object.assign(new Error("Zoption diagnostic test event"), {
        name: "TestDiagnosticsError",
      });
      try {
        transport.captureCrash(sanitizeError(testError, source));
        await transport.flush();
        return true;
      } catch {
        return false;
      }
    },
  };
}

interface GlobalWithErrorUtils {
  ErrorUtils?: {
    getGlobalHandler?(): ((error: unknown, isFatal: boolean) => void) | undefined;
    setGlobalHandler(handler: (error: unknown, isFatal: boolean) => void): void;
  };
}

/**
 * Forwards uncaught JS exceptions through the sanitized pipeline while
 * preserving any previously installed handler (React Native's fatal-error
 * surface). SDK autocapture is off, so this is the only path uncaught errors
 * can take - and it transmits no raw message or stack. Delivery on a fatal
 * crash is best-effort.
 */
export function forwardUncaughtErrors(report: (error: unknown) => void): void {
  const errorUtils = (globalThis as GlobalWithErrorUtils).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      report(error);
    } catch {
      /* reporting must never mask the crash itself */
    }
    if (previous) {
      // The platform handler remains authoritative. If it throws, preserve
      // that original behavior instead of hiding it behind telemetry.
      previous(error, isFatal);
    }
  });
}

// NOTE: EXPO_PUBLIC_* values must be read through static property accesses;
// see src/config/public-config.ts. Absent keys keep every build inert.
export const telemetryConfig = parseTelemetryConfig(
  environmentValue(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  environmentValue(process.env.EXPO_PUBLIC_POSTHOG_HOST),
  environmentValue(process.env.EXPO_PUBLIC_TELEMETRY_DISABLED),
);

async function createPostHogTransport(config: TelemetryConfig): Promise<TelemetryTransport> {
  // Lazy import keeps the library off the critical path: disabled builds
  // never execute it, and a failing load is caught by the service's init.
  if (!config.apiKey) {
    throw new Error("EXPO_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_KEY is configured");
  }
  const posthog = await import("posthog-react-native");
  const client = new posthog.default(config.apiKey, createPostHogOptions(config.host));

  let gateListener: ((allowed: boolean) => void) | undefined;
  client.onFeatureFlags((flags) => {
    gateListener?.(flags[REMOTE_KILL_SWITCH_FLAG] === true);
  });

  return {
    captureCrash: (report) => {
      client.capture(CRASH_EVENT_NAME, { ...report });
    },
    capture: (event, properties) => {
      client.capture(event, properties);
    },
    identify: (distinctId, personProperties) => {
      client.identify(distinctId, personProperties);
    },
    reset: () => {
      client.reset();
    },
    flush: () => client.flush(),
    onRemoteGateChange: (listener) => {
      gateListener = listener;
      // Resolve immediately from cached state when available. Undefined is
      // deliberately closed until the current flag request completes.
      listener(client.getFeatureFlag(REMOTE_KILL_SWITCH_FLAG, { sendEvent: false }) === true);
    },
  };
}

/** Minimal PostHog configuration used by the real transport. */
export function createPostHogOptions(host: string) {
  return {
    host,
    // Do not persist a device identity or queued events across app restarts.
    // An authenticated subject is deliberately identified at the session
    // boundary, including for sanitized crash attribution.
    persistence: "memory" as const,
    personProfiles: "identified_only" as const,
    setDefaultPersonProperties: false,
    customAppProperties: () => ({}),
    disableSurveys: true,
    // Crash reports only: no lifecycle analytics, no session replay, no
    // console capture, and NO SDK exception autocapture - autocapture would
    // bypass sanitization by transmitting raw errors and stacks. Uncaught
    // errors reach the pipeline exclusively through forwardUncaughtErrors.
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: false,
        unhandledRejections: false,
        console: false,
        nativeCrashes: false,
      },
    },
  };
}

const service = createTelemetryService(telemetryConfig, async (config) => {
  const transport = await createPostHogTransport(config);
  forwardUncaughtErrors((error) => {
    void service.captureException(error, "uncaught-exception");
  });
  return transport;
});

export const telemetry: TelemetryService = service;
