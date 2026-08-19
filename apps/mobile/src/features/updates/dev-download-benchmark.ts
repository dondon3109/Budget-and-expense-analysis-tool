import {
  certificatesMatch,
  isTrustedZoptionSigner,
  parseRemoteAndroidRelease,
  type ParsedAndroidRelease,
} from "./android-release-metadata";
import { downloadReleaseApk, isTrustedDownloadUrl } from "./apk-download";
import { getApkUpdaterNative } from "./apk-updater-native";
import { normalizeSha256 } from "./apk-verify";
import { ANDROID_LATEST_URL, ZOPTION_ANDROID_PACKAGE_ID } from "./constants";
import {
  apkDestinationUri,
  createExpoUpdateFileSystem,
  type DownloadProgress,
} from "./update-filesystem";

/**
 * Development-only APK download benchmark.
 *
 * Exercises the exact optimized `downloadToFile()` path used by the real update
 * (via `downloadReleaseApk`) against the current public Beta APK discovered from
 * the canonical `latest.json`, then runs the real SHA-256 + native trust-anchor
 * verification gates and cleans up the temporary file. It NEVER launches the
 * package installer, so it can be run harmlessly on a device to measure raw
 * transfer / verify throughput. Only wired in under `__DEV__`.
 */

export interface DownloadBenchmarkGates {
  /** Trusted HTTPS + exact host, enforced by `downloadReleaseApk`. */
  trustedUrl: boolean;
  /** Downloaded byte count equals the signed release size. */
  sizeMatches: boolean;
  /** Native SHA-256 digest equals the signed release checksum. */
  sha256Matches: boolean;
  /** APK package id equals the Zoption package id. */
  packageMatches: boolean;
  /** APK versionCode equals the signed release version. */
  versionMatches: boolean;
  /** APK signer equals the permanent Zoption certificate. */
  signerMatches: boolean;
  /** Native verifier (permanent signer trust anchor) accepted the APK. */
  verifiedByNative: boolean;
  /** Temporary APK file was removed after the benchmark. */
  cleanedUp: boolean;
}

export interface DownloadBenchmarkTiming {
  downloadSeconds: number;
  downloadMbps: number;
  transferDurationMs: number | null;
  transferBytesPerSecond: number | null;
  hashMs: number;
  verifyMs: number;
  totalSeconds: number;
}

export interface DownloadBenchmarkResult {
  ok: boolean;
  release: { versionName: string; versionCode: number; size: number; downloadUrl: string } | null;
  gates: DownloadBenchmarkGates;
  timing: DownloadBenchmarkTiming;
  /** Number of throttled onProgress callbacks received during the transfer. */
  progressCallbacks: number;
  error?: string;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function emptyGates(): DownloadBenchmarkGates {
  return {
    trustedUrl: false,
    sizeMatches: false,
    sha256Matches: false,
    packageMatches: false,
    versionMatches: false,
    signerMatches: false,
    verifiedByNative: false,
    cleanedUp: false,
  };
}

export async function runDownloadBenchmark(input: {
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
} = {}): Promise<DownloadBenchmarkResult> {
  const fileSystem = createExpoUpdateFileSystem();
  const native = getApkUpdaterNative();
  const start = nowMs();
  const gates = emptyGates();
  let progressCallbacks = 0;
  let destinationUri: string | null = null;
  let release: ParsedAndroidRelease | null = null;
  const timing: DownloadBenchmarkTiming = {
    downloadSeconds: 0,
    downloadMbps: 0,
    transferDurationMs: null,
    transferBytesPerSecond: null,
    hashMs: 0,
    verifyMs: 0,
    totalSeconds: 0,
  };

  try {
    const response = await fetch(ANDROID_LATEST_URL);
    release = parseRemoteAndroidRelease(await response.json());
    timing.totalSeconds = (nowMs() - start) / 1000;
    if (!release) {
      throw new Error("latest.json did not describe a trusted Zoption release");
    }
    gates.trustedUrl = isTrustedDownloadUrl(release.downloadUrl);

    const directoryUri = await fileSystem.ensureUpdateDirectory();
    destinationUri = apkDestinationUri(directoryUri, release.versionCode);

    console.info("[benchmark] downloading via optimized downloadToFile: " + release.downloadUrl);
    const downloaded = await downloadReleaseApk({
      release,
      fileSystem,
      onProgress: (progress) => {
        progressCallbacks += 1;
        input.onProgress?.(progress);
      },
      signal: input.signal,
    });

    const transferMs = downloaded.transferDurationMs ?? Math.max(1, nowMs() - start);
    timing.transferDurationMs = downloaded.transferDurationMs ?? null;
    timing.transferBytesPerSecond = downloaded.transferBytesPerSecond ?? null;
    timing.downloadSeconds = transferMs / 1000;
    timing.downloadMbps =
      (downloaded.transferBytesPerSecond ?? (release.size / timing.downloadSeconds)) * 8 / 1_000_000;

    const hashStart = nowMs();
    const digest = await native.digestFileSha256Async(downloaded.uri);
    timing.hashMs = nowMs() - hashStart;

    const verifyStart = nowMs();
    const inspection = await native.verifyApkAsync(downloaded.uri, release.versionCode);
    timing.verifyMs = nowMs() - verifyStart;
    gates.verifiedByNative = true;

    gates.sizeMatches = downloaded.size === release.size;
    gates.sha256Matches = normalizeSha256(digest) === normalizeSha256(release.sha256);
    gates.packageMatches = inspection.packageName === ZOPTION_ANDROID_PACKAGE_ID;
    gates.versionMatches = inspection.versionCode === release.versionCode;
    const signer: string | null | undefined =
      inspection.signerSha256.length === 1 ? inspection.signerSha256[0] : null;
    gates.signerMatches =
      signer != null &&
      isTrustedZoptionSigner(signer) &&
      certificatesMatch(signer, release.certificateSha256);

    await fileSystem.deleteUri(destinationUri);
    gates.cleanedUp = true;
  } catch (error) {
    if (destinationUri) {
      await fileSystem.deleteUri(destinationUri).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[benchmark] failed: " + message);
    return {
      ok: false,
      release: release
        ? {
            versionName: release.versionName,
            versionCode: release.versionCode,
            size: release.size,
            downloadUrl: release.downloadUrl,
          }
        : null,
      gates,
      timing: { ...timing, totalSeconds: (nowMs() - start) / 1000 },
      progressCallbacks,
      error: message,
    };
  }

  timing.totalSeconds = (nowMs() - start) / 1000;
  const ok = Object.values(gates).every(Boolean);
  console.info(
    "[benchmark] done: " + timing.downloadSeconds.toFixed(1) + "s " + timing.downloadMbps.toFixed(1) +
      " Mbps down, hash " + Math.round(timing.hashMs) + "ms, verify " + Math.round(timing.verifyMs) +
      "ms, progress callbacks " + progressCallbacks,
  );
  return {
    ok,
    release: {
      versionName: release.versionName,
      versionCode: release.versionCode,
      size: release.size,
      downloadUrl: release.downloadUrl,
    },
    gates,
    timing,
    progressCallbacks,
  };
}