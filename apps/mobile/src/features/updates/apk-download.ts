import type { ParsedAndroidRelease } from "./android-release-metadata";
import { ANDROID_DOWNLOAD_HOST } from "./constants";
import {
  apkDestinationUri,
  type DownloadProgress,
  type DownloadTiming,
  type UpdateFileSystem,
} from "./update-filesystem";

export class ApkDownloadError extends Error {
  readonly code: "cancelled" | "failed" | "invalid-url";

  constructor(code: "cancelled" | "failed" | "invalid-url", message: string) {
    super(message);
    this.name = "ApkDownloadError";
    this.code = code;
  }
}

export function isTrustedDownloadUrl(url: string, expectedUrl = url): boolean {
  if (url !== expectedUrl) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === ANDROID_DOWNLOAD_HOST;
  } catch {
    return false;
  }
}

export async function downloadReleaseApk(input: {
  release: ParsedAndroidRelease;
  fileSystem: UpdateFileSystem;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
}): Promise<{ uri: string; size: number } & DownloadTiming> {
  if (!isTrustedDownloadUrl(input.release.downloadUrl, input.release.downloadUrl)) {
    throw new ApkDownloadError("invalid-url", "The update download URL is not trusted.");
  }

  const directoryUri = await input.fileSystem.ensureUpdateDirectory();
  const destinationUri = apkDestinationUri(directoryUri, input.release.versionCode);
  try {
    const downloaded = await input.fileSystem.downloadToFile({
      url: input.release.downloadUrl,
      destinationUri,
      expectedSize: input.release.size,
      onProgress: input.onProgress,
      signal: input.signal,
    });
    if (input.signal?.aborted) {
      await input.fileSystem.deleteUri(downloaded.uri);
      throw new ApkDownloadError("cancelled", "The update download was cancelled.");
    }
    return downloaded;
  } catch (error) {
    await input.fileSystem.deleteUri(destinationUri).catch(() => undefined);
    if (error instanceof ApkDownloadError) throw error;
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new ApkDownloadError("cancelled", "The update download was cancelled.");
    }
    throw new ApkDownloadError("failed", "The update could not be downloaded.");
  }
}
