/**
 * Operator-enabled crash telemetry and product events for the Android Beta.
 *
 * This is NOT user opt-in: every installation built with an embedded
 * EXPO_PUBLIC_POSTHOG_KEY reports crashes and product events unless the
 * operator disables the pipeline. Two independent gates control exactly that,
 * for both kinds of report:
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
 * stays disabled because it would transmit raw messages, which can embed
 * transaction text, identifiers, or server responses. Each crash is rebuilt
 * as a new error whose message is its coarse type and whose stack holds only
 * frames rebuilt from code locations (function, file, line, column), with the
 * message header cut off before parsing, then sent as a PostHog
 * Error Tracking `$exception` with the reporting source label and a
 * deterministic grouping token. Release builds upload source maps, so those
 * frames resolve to file, function, and line in PostHog.
 * A signed-in account is identified by its Supabase user id with the account
 * email as a person property, so events can be read per account. The identity
 * passes the same kill switch as every event: nothing, including `$identify`,
 * leaves the device while the gate is closed or unknown. Guests and signed-out
 * launches stay on PostHog's memory-scoped device id. See
 * docs/mobile/security-and-privacy.md.
 */

import { LogBox } from "react-native";

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
/** PostHog feature flag that must be truthy for reports to leave the device. */
export const REMOTE_KILL_SWITCH_FLAG = "crash-telemetry-enabled";

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
  /** Canonical frame lines rebuilt from code locations only; never message text. */
  frames: string[];
}

/** Minimal structural surface of the PostHog client the service relies on. */
export interface TelemetryTransport {
  captureCrash(report: SanitizedCrashReport): void;
  /** Captures a product event after a completed user action. */
  capture?(event: string, properties?: Record<string, string | number | boolean>): void;
  identify?(account: TelemetryAccount): void;
  /** Optional so existing minimal transports remain valid in tests. */
  reset?(): void;
  flush(): Promise<void>;
  /** Registers the remote kill-switch listener when the backend supports flags. */
  onRemoteGateChange?(listener: (allowed: boolean) => void): void;
}

/** The signed-in account PostHog attributes events to. */
export interface TelemetryAccount {
  id: string;
  email?: string;
}

export type TelemetryTransportFactory = (config: TelemetryConfig) => Promise<TelemetryTransport>;

export interface TelemetryService {
  /** Resolves even when initialization fails; telemetry can never block startup. */
  init(): Promise<void>;
  isActive(): boolean;
  /** Attributes later events to the signed-in account, once the remote gate is open. */
  identify(account: TelemetryAccount): void;
  /** Clears the analytics identity when the authenticated session ends. */
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
const MAX_FRAMES = 50;

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

// Hermes and V8: "at fn (file:1:2)", "at fn (address at file:1:2)", "at file:1:2".
const AT_FRAME =
  /^\s*at\s+(?:(.+?)\s+\((?:address at\s+)?(.+):(\d+):(\d+)\)|(?:address at\s+)?(.+):(\d+):(\d+))\s*$/;
// JavaScriptCore: "fn@file:1:2" or "@file:1:2".
const AT_SIGN_FRAME = /^\s*([^@\s]*)@(.+):(\d+):(\d+)\s*$/;
const MAX_FUNCTION_LENGTH = 128;
const MAX_FILENAME_LENGTH = 256;

interface ParsedFrame {
  fn?: string;
  file: string;
  lineno: string;
  colno: string;
}

function parseFrame(line: string): ParsedFrame | undefined {
  const at = AT_FRAME.exec(line);
  if (at?.[2] !== undefined) {
    return { fn: at[1], file: at[2], lineno: at[3] ?? "", colno: at[4] ?? "" };
  }
  if (at) return { file: at[5] ?? "", lineno: at[6] ?? "", colno: at[7] ?? "" };
  const sign = AT_SIGN_FRAME.exec(line);
  if (!sign) return undefined;
  return { fn: sign[1], file: sign[2] ?? "", lineno: sign[3] ?? "", colno: sign[4] ?? "" };
}

/**
 * Rebuilds one frame as a canonical V8 line from its code location alone.
 * The file keeps its path, because the SDK matches it against the bundle's
 * debug id for source map lookup, but loses any query or fragment, where a
 * dev-server URL carries tokens.
 */
function canonicalFrame(line: string): string | undefined {
  const frame = parseFrame(line);
  if (!frame) return undefined;
  const filename = (frame.file.split(/[?#]/)[0] ?? "")
    .replace(/[^A-Za-z0-9_.:/-]/g, "")
    .slice(0, MAX_FILENAME_LENGTH);
  if (!filename) return undefined;
  const location = `${filename}:${Number(frame.lineno)}:${Number(frame.colno)}`;
  const name = (frame.fn ?? "").replace(/[^A-Za-z0-9_$.<>]/g, "").slice(0, MAX_FUNCTION_LENGTH);
  return name ? `at ${name} (${location})` : `at ${location}`;
}

/**
 * Code locations only, innermost frame first. The `Name: message` header is
 * cut off before parsing, so a multi-line message cannot leave as
 * continuation lines, even one shaped like a frame; every remaining line must
 * then parse as a frame and is rebuilt from its function, file, line, and
 * column.
 */
export function messageFreeFrames(error: unknown): string[] {
  if (!(error instanceof Error) || typeof error.stack !== "string") return [];
  const header = error.message ? `${error.name}: ${error.message}` : error.name;
  const stack = error.stack.startsWith(header) ? error.stack.slice(header.length) : error.stack;
  const frames: string[] = [];
  for (const line of stack.split(/\r?\n/)) {
    if (frames.length >= MAX_FRAMES) break;
    const frame = canonicalFrame(line);
    if (frame) frames.push(frame);
  }
  return frames;
}

/**
 * The grouping input: message-free frames with line and column numbers
 * normalized, so the same code location groups across minor bundle layout
 * changes.
 */
export function normalizedStackShape(error: unknown): string {
  return messageFreeFrames(error)
    .map((line) => line.replace(/:\d+:\d+(?=\)?$)/, ":#:#"))
    .join("\n")
    .slice(0, FINGERPRINT_INPUT_LIMIT);
}

/**
 * Reduces any thrown value to the only fields that may be transmitted.
 * Messages are never read. Only message-free stack frames feed the grouping
 * fingerprint and the frames list, so sensitive text embedded in an error
 * cannot reach the telemetry backend either directly or as a guessable
 * message hash.
 */
export function sanitizeError(error: unknown, source: string): SanitizedCrashReport {
  const rawName = extractErrorName(error);
  const fingerprintInput = `${rawName}\u0000${normalizedStackShape(error)}`;
  return {
    source: normalizeCrashToken(source, MAX_SOURCE_LENGTH) || "unknown-source",
    type: normalizeCrashToken(rawName, MAX_TYPE_LENGTH) || "UnknownError",
    fingerprint: crashFingerprint(fingerprintInput),
    frames: messageFreeFrames(error),
  };
}

/**
 * The error handed to PostHog's exception builder: its message is the coarse
 * type, its stack is the scrubbed frames, and it has no cause, so the SDK has
 * nothing else to read from it.
 */
export function crashReportError(report: SanitizedCrashReport): Error {
  const error = new Error(report.type);
  error.name = report.type;
  error.stack = [
    `${report.type}: ${report.type}`,
    ...report.frames.map((frame) => `    ${frame}`),
  ].join("\n");
  return error;
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

const MAX_BUFFERED_REPORTS = 25;

type PendingReport =
  | { kind: "crash"; report: SanitizedCrashReport }
  | { kind: "event"; event: string; properties?: Record<string, string | number | boolean> };

/**
 * Buffers crash reports and product events until BOTH the transport exists
 * and the remote gate has answered, then drains in order. If the gate closes,
 * buffered and future reports are dropped (fail-closed).
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
  const pending: PendingReport[] = [];
  // Held until the gate opens, so the identity is sent before any queued event.
  let account: TelemetryAccount | null = null;
  let identifiedId: string | null = null;

  const enqueue = (item: PendingReport): void => {
    if (pending.length >= MAX_BUFFERED_REPORTS) pending.shift();
    pending.push(item);
  };

  const deliverEvent = (
    event: string,
    properties?: Record<string, string | number | boolean>,
  ): void => {
    try {
      transport?.capture?.(event, properties);
    } catch {
      // Product analytics must never interfere with the completed action.
    }
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

  const deliverIdentity = (): void => {
    if (!transport || !account || identifiedId === account.id) return;
    try {
      transport.identify?.(account);
      identifiedId = account.id;
    } catch {
      // Identity is best-effort, like every other report.
    }
  };

  const drainPending = (): void => {
    deliverIdentity();
    while (pending.length > 0) {
      const item = pending.shift();
      if (item?.kind === "crash") deliver(item.report);
      else if (item) deliverEvent(item.event, item.properties);
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
            deliverIdentity();
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
    identify(nextAccount) {
      if (!config.enabled) return;
      account = nextAccount;
      if (identifiedId !== nextAccount.id) identifiedId = null;
      if (transport && gateResolved && gateOpen) deliverIdentity();
    },
    reset() {
      account = null;
      identifiedId = null;
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
      if (!transport) return;
      if (!gateResolved) {
        // app_session_started fires at launch, before flags have loaded.
        enqueue({ kind: "event", event, properties });
        return;
      }
      if (gateOpen) deliverEvent(event, properties);
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
        enqueue({ kind: "crash", report });
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
 * can take - and it transmits no raw message. Delivery on a fatal crash is
 * best-effort.
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
    throw new Error(
      "EXPO_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_KEY is configured",
    );
  }
  const posthog = await import("posthog-react-native");
  if (__DEV__) {
    // PostHog reports a failed background flush through console.error, which a dev build
    // raises as a red error notice. A dropped flush is a network blip, not an app error.
    LogBox.ignoreLogs(["Error while flushing PostHog"]);
  }
  const client = new posthog.default(config.apiKey, createPostHogOptions(config.host));

  let gateListener: ((allowed: boolean) => void) | undefined;
  client.onFeatureFlags((flags) => {
    gateListener?.(flags[REMOTE_KILL_SWITCH_FLAG] === true);
  });

  return {
    captureCrash: (report) => {
      client.captureException(
        crashReportError(report),
        { source: report.source, type: report.type, fingerprint: report.fingerprint },
        { mechanism: { handled: false, type: "generic" } },
      );
    },
    capture: (event, properties) => {
      client.capture(event, properties);
    },
    identify: (account) => {
      client.identify(account.id, account.email ? { email: account.email } : undefined);
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
    // A signed-in account is identified again on every launch; a guest only
    // ever has PostHog's ephemeral device id for the duration of a launch.
    persistence: "memory" as const,
    personProfiles: "identified_only" as const,
    setDefaultPersonProperties: false,
    customAppProperties: () => ({}),
    disableSurveys: true,
    // Only the manual crash reports and product events: no lifecycle
    // analytics, no session replay, no console capture, and NO SDK
    // exception autocapture - autocapture would
    // bypass sanitization by transmitting raw error messages. Uncaught
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
