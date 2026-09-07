import {
  drainVoiceQueue,
  enqueueVoiceCapture,
  isVoiceQueueReachable,
  queuedVoiceCaptureCount,
  resetVoiceQueueIdsForTests,
  type QueuedVoiceCapture,
  type VoiceCaptureQueue,
} from "./offline-voice-queue";

const EMPTY: VoiceCaptureQueue = [];

beforeEach(() => resetVoiceQueueIdsForTests());

function seedQueue(texts: string[]): VoiceCaptureQueue {
  return texts.reduce<VoiceCaptureQueue>(
    (queue, text) => enqueueVoiceCapture(queue, { text }),
    EMPTY,
  );
}

describe("offline voice queue caching", () => {
  it("caches on-device transcripts with status queued", () => {
    const queue = enqueueVoiceCapture(EMPTY, { text: "Spent 250 pesos on lunch" });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      transcript: "Spent 250 pesos on lunch",
      status: "queued",
      attempts: 0,
      noStore: true,
      failureReason: null,
    });
  });

  it("ignores blank recognizer results", () => {
    expect(enqueueVoiceCapture(EMPTY, { text: "   " })).toBe(EMPTY);
  });

  it("counts only outstanding captures", () => {
    const queue = seedQueue(["one", "two"]);
    expect(queuedVoiceCaptureCount(queue)).toBe(2);
    expect(queuedVoiceCaptureCount([])).toBe(0);
  });
});

describe("voice queue reachability (sync-state convention)", () => {
  it("prefers the internet flag and falls back to the connection flag", () => {
    expect(isVoiceQueueReachable({ isInternetReachable: true, isConnected: false })).toBe(true);
    expect(isVoiceQueueReachable({ isInternetReachable: false, isConnected: true })).toBe(false);
    expect(isVoiceQueueReachable({ isConnected: true })).toBe(true);
    expect(isVoiceQueueReachable({})).toBe(false);
  });
});

describe("voice queue drain order", () => {
  it("submits oldest-first through the existing pipeline", async () => {
    const queue = seedQueue(["first", "second", "third"]);
    const submitted: string[] = [];
    const result = await drainVoiceQueue(queue, {
      isOnline: () => true,
      submit: async (item) => {
        submitted.push(item.transcript);
      },
    });
    expect(submitted).toEqual(["first", "second", "third"]);
    expect(result.submitted).toHaveLength(3);
    expect(result.failed).toBe(null);
    expect(result.queue.every((item) => item.status === "done")).toBe(true);
    expect(queuedVoiceCaptureCount(result.queue)).toBe(0);
  });

  it("submits nothing while offline and keeps every item queued", async () => {
    const queue = seedQueue(["first", "second"]);
    const submit = jest.fn(async (_item: QueuedVoiceCapture) => undefined);
    const result = await drainVoiceQueue(queue, { isOnline: () => false, submit });
    expect(submit).not.toHaveBeenCalled();
    expect(result.submitted).toEqual([]);
    expect(result.queue.every((item) => item.status === "queued")).toBe(true);
  });

  it("stops at the first failure so order is preserved", async () => {
    const queue = seedQueue(["first", "second", "third"]);
    const submitted: string[] = [];
    const result = await drainVoiceQueue(queue, {
      isOnline: () => true,
      submit: async (item) => {
        if (item.transcript === "second") throw new Error("parse rejected");
        submitted.push(item.transcript);
      },
    });
    expect(submitted).toEqual(["first"]);
    expect(result.failed).toBe(result.queue[1]!.id);
    expect(result.queue[1]).toMatchObject({
      status: "failed",
      attempts: 1,
      failureReason: "parse rejected",
    });
    expect(result.queue[2]!.status).toBe("queued");
  });

  it("retries failed items in place on the next drain", async () => {
    const queue = seedQueue(["first", "second"]);
    const failing = await drainVoiceQueue(queue, {
      isOnline: () => true,
      submit: async (item) => {
        if (item.transcript === "first") throw new Error("offline mid-drain");
      },
    });
    expect(failing.submitted).toEqual([]);
    const submitted: string[] = [];
    const retry = await drainVoiceQueue(failing.queue, {
      isOnline: () => true,
      submit: async (item) => {
        submitted.push(item.transcript);
      },
    });
    expect(submitted).toEqual(["first", "second"]);
    expect(retry.failed).toBe(null);
  });

  it("carries the no-store flag through to the pipeline", async () => {
    const queue = enqueueVoiceCapture(EMPTY, { text: "private note" }, { noStore: true });
    const seen: boolean[] = [];
    await drainVoiceQueue(queue, {
      isOnline: () => true,
      submit: async (item) => {
        seen.push(item.noStore);
      },
    });
    expect(seen).toEqual([true]);
  });
});
