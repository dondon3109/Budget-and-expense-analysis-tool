/**
 * Offline SpeechRecognizer cache-then-parse queue for quick-capture mic input.
 *
 * When the device is offline, on-device recognizer results are cached locally
 * as transcripts with status "queued" instead of being dropped. When
 * connectivity returns, the queue drains in FIFO order through the existing
 * pipeline (the caller-supplied submit, e.g. AI-entry draft extraction or an
 * assistant turn) — no new sync framework.
 *
 * Conventions reused, not reinvented:
 * - reachability reads `isInternetReachable ?? isConnected`, the same hint
 *   shape `sync-state` and `background-sync-task` use (the Worker's actual
 *   response still decides success);
 * - audio itself is never queued: only the on-device transcript text is
 *   cached, so offline captures stay memory-light and keep the no-store
 *   guarantee (nothing recordable persists);
 * - every item carries its `noStore` flag through to submit so the privacy
 *   path survives the offline round trip.
 *
 * Integration point: feed `enqueueVoiceCapture` with results from the
 * platform on-device recognizer (a `{ text, confidence? }` transcript), then
 * call `drainVoiceQueue` on reconnect with the existing submit pipeline.
 */

export interface OnDeviceTranscript {
  text: string;
  confidence?: number;
}

export type QueuedVoiceCaptureStatus = "queued" | "processing" | "done" | "failed";

export interface QueuedVoiceCapture {
  id: string;
  transcript: string;
  createdAt: string;
  status: QueuedVoiceCaptureStatus;
  attempts: number;
  /** Honored by submit: transcribe/parse without server-side persistence. */
  noStore: boolean;
  failureReason: string | null;
}

export type VoiceCaptureQueue = readonly QueuedVoiceCapture[];

let nextQueueId = 0;

function newQueueId(): string {
  nextQueueId += 1;
  return `voice-${Date.now().toString(36)}-${nextQueueId}`;
}

export function resetVoiceQueueIdsForTests(): void {
  nextQueueId = 0;
}

/**
 * Caches one on-device recognizer result. Blank transcripts are ignored
 * (returns the queue unchanged) so silence never creates phantom drafts.
 */
export function enqueueVoiceCapture(
  queue: VoiceCaptureQueue,
  transcript: OnDeviceTranscript,
  options: { noStore?: boolean; id?: string; createdAt?: string } = {},
): VoiceCaptureQueue {
  const text = transcript.text.trim();
  if (text.length === 0) return queue;
  return [
    ...queue,
    {
      id: options.id ?? newQueueId(),
      transcript: text,
      createdAt: options.createdAt ?? new Date().toISOString(),
      status: "queued",
      attempts: 0,
      noStore: options.noStore ?? true,
      failureReason: null,
    },
  ];
}

export function queuedVoiceCaptureCount(queue: VoiceCaptureQueue): number {
  return queue.filter((item) => item.status === "queued" || item.status === "processing").length;
}

/**
 * Same reachability hint convention as sync-state: NetInfo's internet flag
 * wins, the connection flag is the fallback.
 */
export function isVoiceQueueReachable(state: {
  isInternetReachable?: boolean | null;
  isConnected?: boolean | null;
}): boolean {
  return state.isInternetReachable ?? state.isConnected ?? false;
}

export interface DrainVoiceQueueResult {
  queue: VoiceCaptureQueue;
  /** Ids submitted in FIFO order. */
  submitted: string[];
  /** Id of the item that stopped the drain, if any. */
  failed: string | null;
}

/**
 * Submits queued captures oldest-first through the existing pipeline.
 * Stops at the first failure (or when `isOnline` flips false mid-drain) so
 * order is preserved and a poisoned item never silently reorders later ones.
 * Failed items keep status "failed" with an incremented attempt count and a
 * reason; a later drain retries them in place.
 */
export async function drainVoiceQueue(
  queue: VoiceCaptureQueue,
  pipeline: {
    isOnline: () => boolean;
    submit: (item: QueuedVoiceCapture) => Promise<void>;
  },
): Promise<DrainVoiceQueueResult> {
  const next: QueuedVoiceCapture[] = queue.map((item) => ({ ...item }));
  const submitted: string[] = [];
  let failed: string | null = null;

  for (const item of next) {
    if (item.status !== "queued" && item.status !== "failed") continue;
    if (!pipeline.isOnline()) break;
    item.status = "processing";
    try {
      await pipeline.submit({ ...item });
      item.status = "done";
      item.failureReason = null;
      submitted.push(item.id);
    } catch (error) {
      item.status = "failed";
      item.attempts += 1;
      item.failureReason = error instanceof Error ? error.message : "Voice draft failed. Try again.";
      failed = item.id;
      break;
    }
  }

  return { queue: next, submitted, failed };
}
