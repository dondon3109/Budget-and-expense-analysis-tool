import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ auth }),
}));

import {
  createAssistantThread,
  deleteAssistantThread,
  getBudgets,
  getDashboard,
  sendAssistantMessage,
  sendAuthenticatedSupportChat,
} from "../src/lib/api";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

const userWorkspace: AuthenticatedWorkspace = {
  key: "user:user-1",
  userId: "user-1",
};

function session(token: string) {
  return { access_token: token, user: { id: "user-1" } };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Never resolves until the passed signal aborts, mimicking an in-flight fetch. */
function abortableNever(signal?: AbortSignal | null): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("signal is aborted without reason", "AbortError"));
      return;
    }
    signal?.addEventListener(
      "abort",
      () => reject(new DOMException("signal is aborted without reason", "AbortError")),
      { once: true },
    );
  });
}

const dashboardArgs = { from: "2026-07-01", to: "2026-07-31" } as const;
const turnInput = { message: "How much did I spend?", clientRequestId: crypto.randomUUID() };

describe("API request timeouts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    auth.getSession.mockReset();
    auth.refreshSession.mockReset();
    auth.signOut.mockReset();
    auth.signOut.mockResolvedValue({ error: null });
    auth.getSession.mockResolvedValue({ data: { session: session("token") }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps our own timeout abort to request_timeout instead of leaking AbortError", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => abortableNever(init?.signal));

    const pending = getDashboard(userWorkspace, { ...dashboardArgs });
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 0,
      code: "request_timeout",
      message: "The request took too long. Try again.",
    });
    // Two stalled attempts and the pause between them, so a read that never recovers still fails.
    await vi.advanceTimersByTimeAsync(42_000);
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("repeats a stalled read once and resolves when the repeat succeeds", async () => {
    const plan = { month: "2026-07", categories: [] };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce((_input, init) => abortableNever(init?.signal))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse(plan)));

    const pending = getBudgets(userWorkspace, "2026-07");
    await vi.advanceTimersByTimeAsync(21_000);
    await expect(pending).resolves.toEqual(plan);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a write that times out", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => abortableNever(init?.signal));

    const pending = deleteAssistantThread(userWorkspace, "thread-1");
    const assertion = expect(pending).rejects.toMatchObject({ code: "request_timeout" });
    await vi.advanceTimersByTimeAsync(21_000);
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a read that fails for a reason other than the timeout", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(getBudgets(userWorkspace, "2026-07")).rejects.toThrow("Failed to fetch");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("lets an assistant turn resolve after the old 20s ceiling", async () => {
    const turn = { thread: { id: "thread-1" } };
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(jsonResponse(turn)), 60_000);
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("signal is aborted without reason", "AbortError"));
            },
            { once: true },
          );
        }),
    );

    const pending = createAssistantThread(userWorkspace, { ...turnInput });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toEqual(turn);

    const pendingFollowUp = sendAssistantMessage(userWorkspace, {
      threadId: "thread-1",
      input: { ...turnInput },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pendingFollowUp).resolves.toEqual(turn);
  });

  it("still propagates a caller-initiated abort untouched", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      abortableNever(init?.signal),
    );
    const caller = new AbortController();
    caller.abort(new DOMException("The support request was cancelled.", "AbortError"));

    await expect(
      sendAuthenticatedSupportChat(
        userWorkspace,
        [{ role: "user", content: "Hi" }],
        "assistant",
        caller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
