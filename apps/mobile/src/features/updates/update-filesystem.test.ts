import { File } from "expo-file-system";

import { createExpoUpdateFileSystem, DOWNLOAD_PROGRESS_POLL_MS } from "./update-filesystem";

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
      static downloadFileAsync: jest.Mock = jest.fn();
      uri: string;
      size = 0;
      exists = false;
      constructor(uri: string) {
        this.uri = uri;
      }
      delete() {
        this.exists = false;
      }
    },
  };
});

const downloadFileAsync = File.downloadFileAsync as jest.Mock;

function destinationOfCall(): { size: number; uri: string } {
  const calls = downloadFileAsync.mock.calls as Array<[string, { size: number; uri: string }]>;
  return calls[0]![1];
}

describe("createExpoUpdateFileSystem.downloadToFile", () => {
  let resolveDownload: ((value: unknown) => void) | null;

  beforeEach(() => {
    jest.useFakeTimers();
    resolveDownload = null;
    downloadFileAsync.mockReset();
    downloadFileAsync.mockImplementation(() => new Promise((resolve) => {
      resolveDownload = resolve;
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("samples progress at a throttled interval instead of per chunk", async () => {
    const fs = createExpoUpdateFileSystem();
    const onProgress = jest.fn();
    const destinationUri = "file:///cache/apk-updates/zoption-20301.apk";
    const done = fs.downloadToFile({
      url: "https://downloads.zoption.site/android/zoption.apk",
      destinationUri,
      expectedSize: 1000,
      onProgress,
    });

    // Immediate first sample reports 0 bytes.
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 0, totalBytes: 1000 });

    const dest = destinationOfCall();
    dest.size = 400;
    jest.advanceTimersByTime(DOWNLOAD_PROGRESS_POLL_MS);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 400, totalBytes: 1000 });

    // Many writes in between do not trigger extra JS progress callbacks.
    dest.size = 450;
    dest.size = 500;
    jest.advanceTimersByTime(DOWNLOAD_PROGRESS_POLL_MS);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 500, totalBytes: 1000 });

    resolveDownload?.({ uri: destinationUri, size: 1000 });
    const result = await done;
    expect(result.size).toBe(1000);
    expect(result.transferDurationMs).toBeGreaterThanOrEqual(1);
    expect(result.transferBytesPerSecond).toBeGreaterThanOrEqual(0);
    expect(onProgress).toHaveBeenLastCalledWith({ bytesWritten: 1000, totalBytes: 1000 });
  });

  it("does not poll when no expected size is provided", async () => {
    const fs = createExpoUpdateFileSystem();
    const onProgress = jest.fn();
    const done = fs.downloadToFile({
      url: "https://downloads.zoption.site/android/zoption.apk",
      destinationUri: "file:///cache/apk-updates/zoption-20301.apk",
      onProgress,
    });
    const dest = destinationOfCall();
    dest.size = 300;
    jest.advanceTimersByTime(2000);
    expect(onProgress).not.toHaveBeenCalled();
    resolveDownload?.({ uri: "file:///cache/apk-updates/zoption-20301.apk", size: 300 });
    const result = await done;
    expect(result.size).toBe(300);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});