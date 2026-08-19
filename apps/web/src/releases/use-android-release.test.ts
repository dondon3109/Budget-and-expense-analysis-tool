// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAndroidRelease } from "./useAndroidRelease";

const VALID_METADATA = {
  version: "0.2.2-beta",
  versionCode: 20302,
  downloadUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.2.apk",
  sha256: "1b6fe0039be0377ea51087361048041d202f7bbf4d6d2729662124392f97461b",
  certificateSha256:
    "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D",
  size: 139035425,
  releasedAt: "2026-08-19",
  minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
  reinstallRequired: false,
  notes: ["Added secure in-app update checking."],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAndroidRelease", () => {
  it("loads validated remote metadata with a simple CORS GET", async () => {
    const fetchMock: typeof fetch = vi.fn().mockResolvedValue(jsonResponse(VALID_METADATA));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAndroidRelease());

    expect(result.current.status).toBe("remote");
    expect(result.current.release?.versionName).toBe("0.2.2-beta");
    await waitFor(() => expect(vi.mocked(fetchMock)).toHaveBeenCalled());
    expect(result.current.release?.versionCode).toBe(20302);
    expect(vi.mocked(fetchMock)).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = vi.mocked(fetchMock).mock.calls[0] ?? [];
    expect(requestUrl).toBe("https://downloads.zoption.site/android/latest.json");
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
    expect(requestInit?.headers).toBeUndefined();
    expect(requestInit?.cache).toBeUndefined();
  });

  it("does not treat an unmount abort as unavailable", async () => {
    let rejectFirst: ((reason: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useAndroidRelease());
    expect(result.current.release?.versionName).toBe("0.2.2-beta");
    unmount();
    rejectFirst?.(new DOMException("The operation was aborted.", "AbortError"));
    await Promise.resolve();
    expect(result.current.release?.downloadPath).toContain("zoption-beta-0.2.2.apk");
  });

  it("keeps the shipped R2 snapshot when the live request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    const { result } = renderHook(() => useAndroidRelease());
    await Promise.resolve();
    expect(result.current.status).toBe("remote");
    expect(result.current.release?.downloadPath).toBe(
      "https://downloads.zoption.site/android/zoption-beta-0.2.2.apk",
    );
  });
});
