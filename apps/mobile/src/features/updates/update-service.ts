import { parseRemoteAndroidRelease, type ParsedAndroidRelease } from "./android-release-metadata";
import { cleanupUpdateFiles } from "./apk-cleanup";
import { ApkDownloadError, downloadReleaseApk, isTrustedDownloadUrl } from "./apk-download";
import { getApkUpdaterNative, type ApkUpdaterNativeModule } from "./apk-updater-native";
import { verifyDownloadedApk, type ApkVerifyFailureReason } from "./apk-verify";
import {
  ANDROID_INSTALL_PAGE_URL,
  ANDROID_LATEST_URL,
  AUTO_CHECK_INTERVAL_MS,
  INSTALLER_RESERVATION_MS,
} from "./constants";
import {
  loadUpdatePersistence,
  saveUpdatePersistence,
  shouldShowAutomaticPrompt,
  shouldSkipAutomaticCheck,
  type UpdatePersistenceState,
} from "./update-persistence";
import { decideUpdateAction, type InstalledAndroidApp } from "./update-policy";
import {
  createExpoUpdateFileSystem,
  type DownloadProgress,
  type UpdateFileSystem,
} from "./update-filesystem";

export type UpdateCheckFailureReason =
  "network" | "invalid-metadata" | "downgrade" | "untrusted-signer" | "unsupported";

export type UpdateCheckResult =
  | { status: "current"; installed: InstalledAndroidApp; latest: ParsedAndroidRelease }
  | { status: "available"; installed: InstalledAndroidApp; latest: ParsedAndroidRelease }
  | { status: "reinstallRequired"; installed: InstalledAndroidApp; latest: ParsedAndroidRelease }
  | { status: "unavailable"; reason: UpdateCheckFailureReason };

export interface UpdateTiming {
  /** Wall-clock transfer time, in milliseconds. */
  downloadMs: number;
  /** Measured transfer throughput in bytes per second. */
  downloadBytesPerSecond: number;
  /** Time spent hashing the downloaded APK (SHA-256), in milliseconds. */
  hashMs: number;
  /** Time spent reading the APK package identity and signing certificates. */
  verifyMs: number;
  /** Time spent checking install permission readiness. */
  installPrepMs: number;
  /** Time spent launching the system package installer. */
  installMs: number;
}

export type ApplyUpdateResult =
  | { status: "installed"; stats?: UpdateTiming }
  | { status: "needs-permission"; apkUri: string; stats?: UpdateTiming }
  | { status: "cancelled"; stats?: UpdateTiming }
  | {
      status: "failed";
      reason: "download" | "verification";
      detail?: ApkVerifyFailureReason;
      stats?: UpdateTiming;
    }
  | { status: "failed"; reason: "install"; stats?: UpdateTiming };

export interface UpdateServiceDependencies {
  platform: string;
  now: () => number;
  fetchLatest: () => Promise<unknown>;
  native: ApkUpdaterNativeModule;
  fileSystem: UpdateFileSystem;
  loadPersistence: () => Promise<UpdatePersistenceState>;
  savePersistence: (state: UpdatePersistenceState) => Promise<void>;
  openInstallPage: () => Promise<void>;
  autoCheckIntervalMs: number;
}

export function createDefaultUpdateDependencies(): UpdateServiceDependencies {
  return {
    platform: "android",
    now: () => Date.now(),
    fetchLatest: fetchCanonicalLatestJson,
    native: getApkUpdaterNative(),
    fileSystem: createExpoUpdateFileSystem(),
    loadPersistence: () => loadUpdatePersistence(),
    savePersistence: (state) => saveUpdatePersistence(state),
    openInstallPage: async () => {
      const WebBrowser = await import("expo-web-browser");
      await WebBrowser.openBrowserAsync(ANDROID_INSTALL_PAGE_URL);
    },
    autoCheckIntervalMs: AUTO_CHECK_INTERVAL_MS,
  };
}

export async function fetchCanonicalLatestJson(fetchImpl: typeof fetch = fetch): Promise<unknown> {
  // `latest.json` is mutable release metadata. Every manual or scheduled check
  // must revalidate it; only the versioned APK itself may be cached long-term.
  const metadataUrl = new URL(ANDROID_LATEST_URL);
  metadataUrl.searchParams.set("check", String(Date.now()));
  const response = await fetchImpl(metadataUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store",
    },
  });
  if (!response.ok) {
    throw new Error("The Android update metadata could not be loaded.");
  }
  return response.json() as Promise<unknown>;
}

export async function checkForAndroidUpdate(
  deps: UpdateServiceDependencies,
  options: { force?: boolean } = {},
): Promise<UpdateCheckResult> {
  let installed: InstalledAndroidApp;
  try {
    installed = normalizeInstalledApp(await deps.native.getInstalledPackageInfoAsync());
  } catch {
    return { status: "unavailable", reason: "unsupported" };
  }

  const persistence = await deps.loadPersistence();
  await cleanupUpdateFiles({
    listUpdateFiles: () => deps.fileSystem.listUpdateFiles(),
    deleteUri: (uri) => deps.fileSystem.deleteUri(uri),
    reserved: persistence.reserved,
    now: deps.now(),
  });

  const useCachedRelease =
    !options.force &&
    shouldSkipAutomaticCheck({
      lastSuccessfulCheckAt: persistence.lastSuccessfulCheckAt,
      now: deps.now(),
      intervalMs: deps.autoCheckIntervalMs,
    });

  let payload: unknown;
  if (useCachedRelease) {
    payload = persistence.lastRelease;
  } else {
    try {
      payload = await deps.fetchLatest();
    } catch {
      return { status: "unavailable", reason: "network" };
    }
  }

  const latest = parseRemoteAndroidRelease(payload);
  const decision = decideUpdateAction({
    platform: deps.platform,
    installed,
    latest,
  });

  switch (decision.status) {
    case "current":
    case "available":
    case "reinstallRequired":
      if (!useCachedRelease) {
        await deps.savePersistence({
          ...persistence,
          lastSuccessfulCheckAt: deps.now(),
          lastRelease: payload,
        });
      }
      return decision;
    case "unsupported":
      return { status: "unavailable", reason: "unsupported" };
    case "invalid-metadata":
      return { status: "unavailable", reason: "invalid-metadata" };
    case "untrusted-signer":
      return { status: "unavailable", reason: "untrusted-signer" };
    case "downgrade":
      return { status: "unavailable", reason: "downgrade" };
  }
}

export function promptVisibleForCheck(
  result: UpdateCheckResult,
  persistence: UpdatePersistenceState,
): boolean {
  if (result.status !== "available" && result.status !== "reinstallRequired") {
    return false;
  }
  return shouldShowAutomaticPrompt({
    versionCode: result.latest.versionCode,
    dismissedVersionCode: persistence.dismissedVersionCode,
  });
}

export async function applyAndroidUpdate(
  deps: UpdateServiceDependencies,
  release: ParsedAndroidRelease,
  installed: InstalledAndroidApp,
  options: {
    onProgress?: (progress: DownloadProgress) => void;
    onPhase?: (phase: "downloading" | "verifying" | "installing") => void;
    signal?: AbortSignal;
    onStats?: (stats: UpdateTiming) => void;
  } = {},
): Promise<ApplyUpdateResult> {
  if (!isTrustedDownloadUrl(release.downloadUrl)) {
    return { status: "failed", reason: "download" };
  }

  let downloadedUri: string | null = null;
  const stats = createStats();
  try {
    options.onPhase?.("downloading");
    const downloaded = await downloadReleaseApk({
      release,
      fileSystem: deps.fileSystem,
      onProgress: options.onProgress,
      signal: options.signal,
    });
    downloadedUri = downloaded.uri;
    stats.downloadMs = downloaded.transferDurationMs ?? 0;
    stats.downloadBytesPerSecond = downloaded.transferBytesPerSecond ?? 0;

    options.onPhase?.("verifying");
    let digest: string;
    let inspection: Awaited<ReturnType<UpdateServiceDependencies["native"]["inspectApkAsync"]>>;
    try {
      const hashStart = nowMs();
      digest = await deps.native.digestFileSha256Async(downloaded.uri);
      stats.hashMs = Math.max(0, Math.round(nowMs() - hashStart));
      const verifyStart = nowMs();
      inspection = await deps.native.verifyApkAsync(downloaded.uri, release.versionCode);
      stats.verifyMs = Math.max(0, Math.round(nowMs() - verifyStart));
    } catch {
      await deps.fileSystem.deleteUri(downloaded.uri);
      return attachStats(options, stats, { status: "failed", reason: "verification" });
    }
    const verification = verifyDownloadedApk({
      downloadedSize: downloaded.size,
      expectedSize: release.size,
      downloadedSha256: digest,
      expectedSha256: release.sha256,
      inspection: {
        packageName: inspection.packageName,
        versionCode: Number(inspection.versionCode),
        signerSha256: inspection.signerSha256,
      },
      expectedVersionCode: release.versionCode,
      installedVersionCode: installed.versionCode,
      expectedCertificateSha256: release.certificateSha256,
    });
    if (!verification.ok) {
      await deps.fileSystem.deleteUri(downloaded.uri);
      return attachStats(options, stats, {
        status: "failed",
        reason: "verification",
        detail: verification.reason,
      });
    }

    const prepStart = nowMs();
    const canInstall = await deps.native.canInstallPackagesAsync();
    stats.installPrepMs = Math.max(0, Math.round(nowMs() - prepStart));
    if (!canInstall) {
      await reserveApk(deps, downloaded.uri);
      return attachStats(options, stats, { status: "needs-permission", apkUri: downloaded.uri });
    }

    options.onPhase?.("installing");
    const installStart = nowMs();
    await installReservedApk(deps, downloaded.uri, release);
    stats.installMs = Math.max(0, Math.round(nowMs() - installStart));
    return attachStats(options, stats, { status: "installed" });
  } catch (error) {
    if (error instanceof ApkDownloadError && error.code === "cancelled") {
      if (downloadedUri) {
        await deps.fileSystem.deleteUri(downloadedUri).catch(() => undefined);
      }
      return attachStats(options, stats, { status: "cancelled" });
    }
    if (error instanceof ApkDownloadError) {
      if (downloadedUri) {
        await deps.fileSystem.deleteUri(downloadedUri).catch(() => undefined);
      }
      return attachStats(options, stats, { status: "failed", reason: "download" });
    }
    return attachStats(options, stats, { status: "failed", reason: "install" });
  }
}

export async function continueAndroidInstall(
  deps: UpdateServiceDependencies,
  apkUri: string,
  release: ParsedAndroidRelease,
  installed: InstalledAndroidApp,
  options: { onStats?: (stats: UpdateTiming) => void } = {},
): Promise<ApplyUpdateResult> {
  const stats = createStats();
  stats.downloadMs = -1;
  stats.downloadBytesPerSecond = -1;
  try {
    const prepStart = nowMs();
    const canInstall = await deps.native.canInstallPackagesAsync();
    stats.installPrepMs = Math.max(0, Math.round(nowMs() - prepStart));
    if (!canInstall) {
      return attachStats(options, stats, { status: "needs-permission", apkUri });
    }
    const size = await deps.fileSystem.fileSize(apkUri);
    let digest: string;
    let inspection: Awaited<ReturnType<UpdateServiceDependencies["native"]["verifyApkAsync"]>>;
    try {
      const hashStart = nowMs();
      digest = await deps.native.digestFileSha256Async(apkUri);
      stats.hashMs = Math.max(0, Math.round(nowMs() - hashStart));
      const verifyStart = nowMs();
      inspection = await deps.native.verifyApkAsync(apkUri, release.versionCode);
      stats.verifyMs = Math.max(0, Math.round(nowMs() - verifyStart));
    } catch {
      await deps.fileSystem.deleteUri(apkUri);
      return attachStats(options, stats, { status: "failed", reason: "verification" });
    }
    const verification = verifyDownloadedApk({
      downloadedSize: size,
      expectedSize: release.size,
      downloadedSha256: digest,
      expectedSha256: release.sha256,
      inspection: {
        packageName: inspection.packageName,
        versionCode: Number(inspection.versionCode),
        signerSha256: inspection.signerSha256,
      },
      expectedVersionCode: release.versionCode,
      installedVersionCode: installed.versionCode,
      expectedCertificateSha256: release.certificateSha256,
    });
    if (!verification.ok) {
      await deps.fileSystem.deleteUri(apkUri);
      return attachStats(options, stats, {
        status: "failed",
        reason: "verification",
        detail: verification.reason,
      });
    }
    const installStart = nowMs();
    await installReservedApk(deps, apkUri, release);
    stats.installMs = Math.max(0, Math.round(nowMs() - installStart));
    return attachStats(options, stats, { status: "installed" });
  } catch {
    await deps.fileSystem.deleteUri(apkUri).catch(() => undefined);
    return attachStats(options, stats, { status: "failed", reason: "install" });
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function createStats(): UpdateTiming {
  return {
    downloadMs: 0,
    downloadBytesPerSecond: 0,
    hashMs: 0,
    verifyMs: 0,
    installPrepMs: 0,
    installMs: 0,
  };
}

function attachStats<T extends object>(
  options: { onStats?: (stats: UpdateTiming) => void },
  stats: UpdateTiming,
  result: T,
): T & { stats?: UpdateTiming } {
  if (!options.onStats) return result;
  options.onStats(stats);
  return { ...result, stats };
}

async function installReservedApk(
  deps: UpdateServiceDependencies,
  apkUri: string,
  release: ParsedAndroidRelease,
): Promise<void> {
  await deps.native.installApkAsync(apkUri, release.versionCode);
  await reserveApk(deps, apkUri);
}

async function reserveApk(deps: UpdateServiceDependencies, apkUri: string): Promise<void> {
  const persistence = await deps.loadPersistence();
  await deps.savePersistence({
    ...persistence,
    reserved: {
      uri: apkUri,
      reservedUntil: deps.now() + INSTALLER_RESERVATION_MS,
    },
  });
}

function normalizeInstalledApp(value: InstalledAndroidApp): InstalledAndroidApp {
  return {
    packageName: value.packageName,
    versionName: value.versionName,
    versionCode: Number(value.versionCode),
  };
}
