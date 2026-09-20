/**
 * Dev-only cold start phase marks.
 *
 * Every mark is gated on `__DEV__`, so a release build records and logs
 * nothing: the instrumentation cannot affect the timings it measures, and no
 * startup detail ships. Phase names are developer literals and carry no user
 * data, so this deliberately stays out of the sanitized telemetry pipeline.
 */
export interface StartupPhase {
  phase: string;
  /** Milliseconds since the first mark was recorded. */
  atMs: number;
  /** Milliseconds since the previous mark, or since the first. */
  deltaMs: number;
}

let startedAt = Date.now();
let lastMarkAt = startedAt;
const phases: StartupPhase[] = [];

/**
 * Records one cold start phase. Repeat names are ignored, so a caller inside
 * a refresh loop can mark the first result without guarding.
 */
export function markStartupPhase(phase: string): void {
  if (!__DEV__) return;
  if (phases.some((recorded) => recorded.phase === phase)) return;
  const now = Date.now();
  const record: StartupPhase = { phase, atMs: now - startedAt, deltaMs: now - lastMarkAt };
  lastMarkAt = now;
  phases.push(record);
  console.log(`[startup] ${phase}: +${record.deltaMs}ms (t+${record.atMs}ms)`);
}

/** Marks recorded so far, oldest first. */
export function startupPhases(): readonly StartupPhase[] {
  return phases;
}

/** Test seam: clears recorded marks and restarts the clock reference. */
export function resetStartupTiming(): void {
  phases.length = 0;
  startedAt = Date.now();
  lastMarkAt = startedAt;
}
