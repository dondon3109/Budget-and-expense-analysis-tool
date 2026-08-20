import { File } from "expo-file-system";

import {
  createExpoUpdateFileSystem,
  DOWNLOAD_PROGRESS_POLL_MS,
  type NativeApkDownloader,
} from "./update-filesystem";

const mockFiles = new Map<string, { exists: boolean; size: number }>();

jest.mock("expo-file-system", () => {
  return {
    Paths: { cache: "file:///cache" },
    Directory: class {
      uri: string;
      exists = true;
      constructor(...parts: string[]) {
        this.uri = parts.join("/");
      }
      create() {
        this.exists = true;
      }
      list(): never[] {
        return [];
      }
    },
    File: class {
      uri: string;
      constructor(uri: string) {
        this.uri = uri;
        if (!mockFiles.has(uri)) mockFiles.set(uri, { exists: false, size: 0 });
      }
      get size() {
        return mockFiles.get(this.uri)?.size ?? 0;
      }
      set size(value: number) {
        const record = mockFiles.get(this.uri) ?? { exists: false, size: 0 };
        record.size = value;
        mockFiles.set(this.uri, record);
      }
      get exists() {
        return mockFiles.get(this.uri)?.exists ?? false;
      }
      set exists(value: boolean) {
        const record = mockFiles.get(this.uri) ?? { exists: false, size: 0 };
        record.exists = value;
        mockFiles.set(this.uri, record);
      }
      delete() {
        mockFiles.set(this.uri, { exists: false, size: 0 });
      }
    },
  };
});

describe("createExpoUpdateFileSystem.downloadToFile", () => {
  let resolveDownload: ((value: { uri: string; size: number }) => void) | null;
  let rejectDownload: ((reason: unknown) => void) | null;
  let native: jest.Mocked<NativeApkDownloader>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockFiles.clear();
    resolveDownload = null;
    rejectDownload = null;
    native = {
      downloadApkAsync: jest.fn(
        (downloadId: string, url: string, destinationUri: string, expectedSize: number) => {
          void [downloadId, url, destinationUri, expectedSize];
          return new Promise((resolve, reject) => {
            resolveDownload = resolve;
            rejectDownload = reject;
          });
        },
      ),
      cancelApkDownloadAsync: jest.fn(async (downloadId: string) => {
        void downloadId;
      }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function destinationOfCall(): File {
    const calls = native.downloadApkAsync.mock.calls;
    return new File(calls[0]![2]);
  }

  function finishDownload(size: number): void {
    const destination = destinationOfCall();
    destination.size = size;
    destination.exists = true;
    resolveDownload?.({ uri: destination.uri, size });
  }

  it("samples progress at a throttled interval instead of subscribing to native events", async () => {
    const fs = createExpoUpdateFileSystem(native);
    const onProgress = jest.fn();
    const destinationUri = "file:///cache/apk-updates/zoption-20301.apk";
    const done = fs.downloadToFile({
      url: "https://downloads.zoption.site/android/zoption.apk",
      destinationUri,
      expectedSize: 1000,
      onProgress,
    });

    expect(native.downloadApkAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^apk-/),
      "https://downloads.zoption.site/android/zoption.apk",
      destinationUri,
      1000,
    );
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 0, totalBytes: 1000 });

    const destination = destinationOfCall();
    destination.size = 400;
    jest.advanceTimersByTime(DOWNLOAD_PROGRESS_POLL_MS);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 400, totalBytes: 1000 });

    destination.size = 500;
    jest.advanceTimersByTime(DOWNLOAD_PROGRESS_POLL_MS);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 500, totalBytes: 1000 });

    finishDownload(1000);
    const result = await done;
    expect(result.size).toBe(1000);
    expect(result.transferDurationMs).toBeGreaterThanOrEqual(1);
    expect(result.transferBytesPerSecond).toBeGreaterThanOrEqual(0);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 1000, totalBytes: 1000 });
  });

  it("does not poll when no progress callback is provided", async () => {
    const fs = createExpoUpdateFileSystem(native);
    const done = fs.downloadToFile({
      url: "https://downloads.zoption.site/android/zoption.apk",
      destinationUri: "file:///cache/apk-updates/zoption-20301.apk",
      expectedSize: 300,
    });
    destinationOfCall().size = 300;
    jest.advanceTimersByTime(2000);
    finishDownload(300);
    const result = await done;
    expect(result.size).toBe(300);
    expect(native.downloadApkAsync).toHaveBeenCalledTimes(1);
  });

  it("cancels the native stream and removes its abort listener", async () => {
    const fs = createExpoUpdateFileSystem(native);
    const controller = new AbortController();
    const done = fs.downloadToFile({
      url: "https://downloads.zoption.site/android/zoption.apk",
      destinationUri: "file:///cache/apk-updates/zoption-20301.apk",
      expectedSize: 1000,
      signal: controller.signal,
    });
    const downloadId = native.downloadApkAsync.mock.calls[0]![0];

    controller.abort();
    expect(native.cancelApkDownloadAsync).toHaveBeenCalledWith(downloadId);
    rejectDownload?.(new Error("native stream cancelled"));
    await expect(done).rejects.toThrow("native stream cancelled");

    controller.abort();
    expect(native.cancelApkDownloadAsync).toHaveBeenCalledTimes(1);
  });

  it("does not start native work for an already-aborted signal", async () => {
    const fs = createExpoUpdateFileSystem(native);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fs.downloadToFile({
        url: "https://downloads.zoption.site/android/zoption.apk",
        destinationUri: "file:///cache/apk-updates/zoption-20301.apk",
        expectedSize: 1000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(native.downloadApkAsync).not.toHaveBeenCalled();
  });
});
