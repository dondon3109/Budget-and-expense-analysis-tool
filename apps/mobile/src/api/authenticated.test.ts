import { ApiTransportError, apiRequest } from "./authenticated";

const token = "access-token";
jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

/**
 * A fetch that never settles on its own and rejects only when its own signal
 * aborts. React Native surfaces that rejection as whatever the platform gives
 * us, so the error is injected rather than assumed to be a DOMException.
 */
function stalledFetch(error: unknown) {
  return jest.fn(
    (...args: Parameters<typeof fetch>): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        const init = args[1];
        if (init?.signal?.aborted) {
          reject(error);
          return;
        }
        init?.signal?.addEventListener("abort", () => reject(error), { once: true });
      }),
  );
}

function request(
  fetchImpl: typeof fetch,
  options: { timeoutMs?: number; timeoutFallback?: string; signal?: AbortSignal } = {},
) {
  return apiRequest({
    accessToken: token,
    path: "/api/app/transactions",
    method: "GET",
    fetchImpl,
    decode: (value: unknown) => value,
    fallback: "Something went wrong.",
    ...options,
  });
}

describe("apiRequest timeout", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects a stalled request after the default 30s ceiling", async () => {
    jest.useFakeTimers();
    // React Native reports an aborted socket as a generic error, not AbortError.
    const fetchMock = stalledFetch(new Error("Network request failed"));
    const settled = request(fetchMock).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(30_000);

    const error = await settled;
    expect(error).toBeInstanceOf(ApiTransportError);
    expect(error).toMatchObject({
      name: "ApiTransportError",
      code: "network",
      status: 0,
      serverCode: "request_timeout",
      message: "Zoption did not respond in time. Try again.",
    });
  });

  it("honours an explicit timeoutMs override instead of the default", async () => {
    jest.useFakeTimers();
    const fetchMock = stalledFetch(new Error("Network request failed"));
    const settled = request(fetchMock, { timeoutMs: 5_000 }).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(5_000);

    await expect(settled).resolves.toMatchObject({
      serverCode: "request_timeout",
    });
  });

  it("uses timeoutFallback as the timeout message when provided", async () => {
    jest.useFakeTimers();
    const fetchMock = stalledFetch(new Error("Network request failed"));
    const settled = request(fetchMock, {
      timeoutFallback: "The voice note took too long. Try again.",
    }).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(30_000);

    await expect(settled).resolves.toMatchObject({
      message: "The voice note took too long. Try again.",
      serverCode: "request_timeout",
    });
  });

  it("propagates a caller-initiated abort untouched rather than as a timeout", async () => {
    const controller = new AbortController();
    const fetchMock = stalledFetch(new DOMException("Aborted", "AbortError"));
    const settled = request(fetchMock, { signal: controller.signal }).catch(
      (error: unknown) => error,
    );

    controller.abort();

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(error).not.toBeInstanceOf(ApiTransportError);
  });
});
