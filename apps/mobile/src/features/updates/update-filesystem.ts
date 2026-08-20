import { Directory, File, Paths } from "expo-file-system";

import { getApkUpdaterNative } from "./apk-updater-native";
import { UPDATE_CACHE_DIRECTORY } from "./constants";

/**
 * Throttled interval for sampling on-disk progress while the updater-native
 * stream writes the APK. The native transfer emits no progress events, so the
 * React tree receives at most four bounded updates per second.
 */
export const DOWNLOAD_PROGRESS_POLL_MS = 250;

export interface NativeApkDownloader {
  downloadApkAsync(
    downloadId: string,
    downloadUrl: string,
    destinationUri: string,
    expectedSize: number,
  ): Promise<{ uri: string; size: number }>;
  cancelApkDownloadAsync(downloadId: string): Promise<void>;
}

export interface DownloadProgress {
  bytesWritten: number;
  totalBytes: number;
}

export interface DownloadTiming {
  /** Wall-clock time spent transferring bytes, in milliseconds. */
  transferDurationMs?: number;
  /** Measured transfer throughput in bytes per second (size / duration). */
  transferBytesPerSecond?: number;
}

export interface UpdateFileSystem {
  ensureUpdateDirectory(): Promise<string>;
  downloadToFile(input: {
    url: string;
    destinationUri: string;
    /** Expected final size of the artifact, used to render throttled progress. */
    expectedSize: number;
    onProgress?: (progress: DownloadProgress) => void;
    signal?: AbortSignal;
  }): Promise<{ uri: string; size: number } & DownloadTiming>;
  fileSize(uri: string): Promise<number>;
  deleteUri(uri: string): Promise<void>;
  listUpdateFiles(): Promise<string[]>;
}

export function apkDestinationUri(directoryUri: string, versionCode: number): string {
  const trimmed = directoryUri.endsWith("/") ? directoryUri : `${directoryUri}/`;
  return `${trimmed}zoption-${versionCode}.apk`;
}

function updateDirectory(): Directory {
  return new Directory(Paths.cache, UPDATE_CACHE_DIRECTORY);
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

let nextDownloadId = 0;

function createDownloadId(): string {
  nextDownloadId = (nextDownloadId + 1) % Number.MAX_SAFE_INTEGER;
  return `apk-${Date.now()}-${nextDownloadId}`;
}

function abortError(): Error {
  const error = new Error("The APK download was cancelled.");
  error.name = "AbortError";
  return error;
}

export function createExpoUpdateFileSystem(
  native: NativeApkDownloader = getApkUpdaterNative(),
): UpdateFileSystem {
  return {
    ensureUpdateDirectory() {
      const directory = updateDirectory();
      if (!directory.exists) {
        directory.create({ intermediates: true, idempotent: true });
      }
      return Promise.resolve(directory.uri);
    },
    async downloadToFile(input) {
      const destination = new File(input.destinationUri);
      if (destination.exists) {
        destination.delete();
      }
      if (input.signal?.aborted) {
        throw abortError();
      }
      const startedAt = nowMs();
      const downloadId = createDownloadId();
      const cancelNativeDownload = () => {
        void native.cancelApkDownloadAsync(downloadId).catch(() => undefined);
      };
      input.signal?.addEventListener("abort", cancelNativeDownload, { once: true });
      const downloadPromise = native.downloadApkAsync(
        downloadId,
        input.url,
        destination.uri,
        input.expectedSize,
      );

      let progressTimer: ReturnType<typeof setInterval> | null = null;
      const expectedSize = input.expectedSize;
      if (input.onProgress && expectedSize > 0) {
        const reportProgress = () => {
          if (input.signal?.aborted) return;
          const bytesWritten = destination.size;
          input.onProgress?.({ bytesWritten, totalBytes: expectedSize });
        };
        progressTimer = setInterval(reportProgress, DOWNLOAD_PROGRESS_POLL_MS);
        reportProgress();
      }

      try {
        const downloaded = await downloadPromise;
        if (progressTimer !== null) {
          clearInterval(progressTimer);
        }
        if (input.signal?.aborted) {
          throw abortError();
        }
        const transferDurationMs = Math.max(1, Math.round(nowMs() - startedAt));
        input.onProgress?.({
          bytesWritten: downloaded.size,
          totalBytes: expectedSize,
        });
        return {
          uri: downloaded.uri,
          size: downloaded.size,
          transferDurationMs,
          transferBytesPerSecond: Math.round(downloaded.size / (transferDurationMs / 1000)),
        };
      } catch (error) {
        if (progressTimer !== null) {
          clearInterval(progressTimer);
        }
        throw error;
      } finally {
        input.signal?.removeEventListener("abort", cancelNativeDownload);
      }
    },
    fileSize(uri) {
      const file = new File(uri);
      return Promise.resolve(file.exists ? file.size : 0);
    },
    deleteUri(uri) {
      try {
        const file = new File(uri);
        if (file.exists) {
          file.delete();
        }
      } catch {
        // Cleanup is best-effort; a missing file is already the desired state.
      }
      return Promise.resolve();
    },
    listUpdateFiles() {
      const directory = updateDirectory();
      if (!directory.exists) return Promise.resolve([]);
      try {
        return Promise.resolve(
          directory
            .list()
            .filter((entry): entry is File => entry instanceof File)
            .map((file) => file.uri),
        );
      } catch {
        return Promise.resolve([]);
      }
    },
  };
}
