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

export type ApplyUpdateResult =
  | { status: "installed" }
  | { status: "needs-permission"; apkUri: string }
  | { status: "cancelled" }
  | { status: "failed"; reason: "download" | "verification"; detail?: ApkVerifyFailureReason }
  | { status: "failed"; reason: "install" };

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
  const response = await fetchImpl(ANDROID_LATEST_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
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
  } = {},
): Promise<ApplyUpdateResult> {
  if (!isTrustedDownloadUrl(release.downloadUrl)) {
    return { status: "failed", reason: "download" };
  }

  let downloadedUri: string | null = null;
  try {
    options.onPhase?.("downloading");
    const downloaded = await downloadReleaseApk({
      release,
      fileSystem: deps.fileSystem,
      onProgress: options.onProgress,
      signal: options.signal,
    });
    downloadedUri = downloaded.uri;

    options.onPhase?.("verifying");
    let digest: string;
    let inspection: Awaited<ReturnType<UpdateServiceDependencies["native"]["inspectApkAsync"]>>;
    try {
      digest = await deps.native.digestFileSha256Async(downloaded.uri);
      inspection = await deps.native.verifyApkAsync(downloaded.uri, release.versionCode);
    } catch {
      await deps.fileSystem.deleteUri(downloaded.uri);
      return { status: "failed", reason: "verification" };
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
      return { status: "failed", reason: "verification", detail: verification.reason };
    }

    const canInstall = await deps.native.canInstallPackagesAsync();
    if (!canInstall) {
      await reserveApk(deps, downloaded.uri);
      return { status: "needs-permission", apkUri: downloaded.uri };
    }

    options.onPhase?.("installing");
    await installReservedApk(deps, downloaded.uri, release);
    return { status: "installed" };
  } catch (error) {
    if (error instanceof ApkDownloadError && error.code === "cancelled") {
      if (downloadedUri) {
        await deps.fileSystem.deleteUri(downloadedUri).catch(() => undefined);
      }
      return { status: "cancelled" };
    }
    if (error instanceof ApkDownloadError) {
      if (downloadedUri) {
        await deps.fileSystem.deleteUri(downloadedUri).catch(() => undefined);
      }
      return { status: "failed", reason: "download" };
    }
    return { status: "failed", reason: "install" };
  }
}

export async function continueAndroidInstall(
  deps: UpdateServiceDependencies,
  apkUri: string,
  release: ParsedAndroidRelease,
  installed: InstalledAndroidApp,
): Promise<ApplyUpdateResult> {
  try {
    const canInstall = await deps.native.canInstallPackagesAsync();
    if (!canInstall) {
      return { status: "needs-permission", apkUri };
    }
    const size = await deps.fileSystem.fileSize(apkUri);
    let digest: string;
    let inspection: Awaited<ReturnType<UpdateServiceDependencies["native"]["verifyApkAsync"]>>;
    try {
      digest = await deps.native.digestFileSha256Async(apkUri);
      inspection = await deps.native.verifyApkAsync(apkUri, release.versionCode);
    } catch {
      await deps.fileSystem.deleteUri(apkUri);
      return { status: "failed", reason: "verification" };
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
      return { status: "failed", reason: "verification", detail: verification.reason };
    }
    await installReservedApk(deps, apkUri, release);
    return { status: "installed" };
  } catch {
    await deps.fileSystem.deleteUri(apkUri).catch(() => undefined);
    return { status: "failed", reason: "install" };
  }
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
