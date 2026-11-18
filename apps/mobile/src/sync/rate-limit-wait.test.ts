import { MobileSyncTransportError } from "@/api/mobile-sync";

import { rateLimitDelaySeconds, withRateLimitWait } from "./rate-limit-wait";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.2.62-beta" } },
}));

function rateLimited(retryAfterSeconds: number | null): MobileSyncTransportError {
  return new MobileSyncTransportError("Too many", "rate_limited", 429, retryAfterSeconds);
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("withRateLimitWait", () => {
  it("waits out a 429 for its Retry-After and repeats the request", async () => {
    const call = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(rateLimited(7))
      .mockResolvedValueOnce("page");
    const result = withRateLimitWait(new AbortController().signal, call);

    await jest.advanceTimersByTimeAsync(6_999);
    expect(call).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBe("page");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("gives up after three waits", async () => {
    const call = jest.fn<Promise<string>, []>().mockRejectedValue(rateLimited(1));
    const result = withRateLimitWait(new AbortController().signal, call);
    const settled = expect(result).rejects.toMatchObject({ code: "rate_limited" });

    await jest.advanceTimersByTimeAsync(3_000);

    await settled;
    expect(call).toHaveBeenCalledTimes(4);
  });

  it("does not wait past a minute or on other errors", async () => {
    const longWait = jest.fn<Promise<string>, []>().mockRejectedValue(rateLimited(120));
    await expect(withRateLimitWait(new AbortController().signal, longWait)).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(longWait).toHaveBeenCalledTimes(1);

    const retryable = new MobileSyncTransportError("Down", "retryable", 503);
    const failing = jest.fn<Promise<string>, []>().mockRejectedValue(retryable);
    await expect(withRateLimitWait(new AbortController().signal, failing)).rejects.toBe(retryable);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the run is aborted", async () => {
    const controller = new AbortController();
    const call = jest.fn<Promise<string>, []>().mockRejectedValue(rateLimited(30));
    const result = withRateLimitWait(controller.signal, call);
    const settled = expect(result).rejects.toMatchObject({ name: "AbortError" });

    await jest.advanceTimersByTimeAsync(0);
    controller.abort();

    await settled;
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe("rateLimitDelaySeconds", () => {
  it("falls back to five seconds and clamps to the cap", () => {
    expect(rateLimitDelaySeconds(rateLimited(null))).toBe(5);
    expect(rateLimitDelaySeconds(rateLimited(0))).toBe(1);
    expect(rateLimitDelaySeconds(rateLimited(400), 300)).toBe(300);
  });
});
