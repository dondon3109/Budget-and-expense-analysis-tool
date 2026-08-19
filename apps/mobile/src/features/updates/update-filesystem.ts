import { Directory, File, Paths } from "expo-file-system";

import { UPDATE_CACHE_DIRECTORY } from "./constants";

/**
 * Throttled interval for sampling on-disk progress while a NativeModule
 * streams a download to disk. The native download task does NOT emit a
 * progress callback per chunk across the JS bridge (that per-chunk event
 * flood can backpressure the transfer and trigger a React re-render storm),
 * so progress is sampled from the destination file size at this bounded rate.
 */
export const DOWNLOAD_PROGRESS_POLL_MS = 250;

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
    expectedSize?: number;
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

export function createExpoUpdateFileSystem(): UpdateFileSystem {
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
      const startedAt = nowMs();
      // No onProgress is passed to the native download task: the NativeModule
      // streams to disk at full speed and progress is sampled below instead of
      // flooding the JS bridge with a per-chunk callback for every ~64KiB.
      const downloadPromise = File.downloadFileAsync(input.url, destination, {
        idempotent: true,
        signal: input.signal,
      });

      let progressTimer: ReturnType<typeof setInterval> | null = null;
      const expectedSize = input.expectedSize ?? 0;
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
        const file = await downloadPromise;
        if (progressTimer !== null) {
          clearInterval(progressTimer);
        }
        const transferDurationMs = Math.max(1, Math.round(nowMs() - startedAt));
        input.onProgress?.({ bytesWritten: file.size, totalBytes: expectedSize || file.size });
        return {
          uri: file.uri,
          size: file.size,
          transferDurationMs,
          transferBytesPerSecond: Math.round(file.size / (transferDurationMs / 1000)),
        };
      } catch (error) {
        if (progressTimer !== null) {
          clearInterval(progressTimer);
        }
        throw error;
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