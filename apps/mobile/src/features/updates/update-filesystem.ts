import { Directory, File, Paths } from "expo-file-system";

import { UPDATE_CACHE_DIRECTORY } from "./constants";

export interface DownloadProgress {
  bytesWritten: number;
  totalBytes: number;
}

export interface UpdateFileSystem {
  ensureUpdateDirectory(): Promise<string>;
  downloadToFile(input: {
    url: string;
    destinationUri: string;
    onProgress?: (progress: DownloadProgress) => void;
    signal?: AbortSignal;
  }): Promise<{ uri: string; size: number }>;
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
      const downloaded = await File.downloadFileAsync(input.url, destination, {
        idempotent: true,
        onProgress: input.onProgress,
        signal: input.signal,
      });
      return { uri: downloaded.uri, size: downloaded.size };
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
