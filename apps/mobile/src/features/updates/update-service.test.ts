import { ZOPTION_ANDROID_PACKAGE_ID, ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";
import type { ApkInspection } from "./apk-verify";
import type { ApkUpdaterNativeModule } from "./apk-updater-native";
import type { InstalledAndroidApp } from "./update-policy";
import type { UpdateFileSystem } from "./update-filesystem";
import type { UpdatePersistenceState } from "./update-persistence";
import {
  applyAndroidUpdate,
  checkForAndroidUpdate,
  continueAndroidInstall,
  fetchCanonicalLatestJson,
  type UpdateServiceDependencies,
} from "./update-service";
import {
  AVAILABLE_VERSION_CODE,
  INSTALLED_VERSION_CODE,
  VALID_APK_SHA256,
  installedApp,
  parsedRelease,
  validInspection,
  validRemoteMetadata,
} from "./test-fixtures";

function nativeTrustWouldReject(
  inspection: ApkInspection,
  expectedVersionCode: number,
  installed: InstalledAndroidApp,
): boolean {
  return (
    installed.packageName !== ZOPTION_ANDROID_PACKAGE_ID ||
    inspection.packageName !== ZOPTION_ANDROID_PACKAGE_ID ||
    expectedVersionCode <= 0 ||
    inspection.versionCode !== expectedVersionCode ||
    inspection.versionCode <= installed.versionCode ||
    inspection.signerSha256.length !== 1 ||
    inspection.signerSha256[0] !== ZOPTION_ANDROID_SIGNER_SHA256
  );
}

function createDeps(
  overrides: {
    metadata?: unknown;
    fetchError?: boolean;
    installed?: ReturnType<typeof installedApp>;
    inspection?: ReturnType<typeof validInspection>;
    digest?: string;
    size?: number;
    canInstall?: boolean;
    lastSuccessfulCheckAt?: number;
    lastRelease?: unknown;
    downloadError?: boolean;
    downloadTiming?: { transferDurationMs: number; transferBytesPerSecond: number };
  } = {},
): UpdateServiceDependencies & {
  deleted: string[];
  installedApks: string[];
  openedSettings: number;
  fetchCount: number;
} {
  const deleted: string[] = [];
  const installedApks: string[] = [];
  let openedSettings = 0;
  let fetchCount = 0;
  let persistence: UpdatePersistenceState = {
    lastSuccessfulCheckAt: overrides.lastSuccessfulCheckAt ?? 0,
    reserved: null,
    lastRelease: overrides.lastRelease,
  };
  const native: ApkUpdaterNativeModule = {
    getInstalledPackageInfoAsync: async () => overrides.installed ?? installedApp(),
    downloadApkAsync: async (_downloadId, _downloadUrl, destinationUri) => ({
      uri: destinationUri,
      size: overrides.size ?? 1024,
    }),
    cancelApkDownloadAsync: async () => undefined,
    digestFileSha256Async: async () => overrides.digest ?? VALID_APK_SHA256,
    inspectApkAsync: async () => overrides.inspection ?? validInspection(),
    verifyApkAsync: async (_uri, expectedVersionCode) => {
      const inspection = overrides.inspection ?? validInspection();
      const installed = overrides.installed ?? installedApp();
      if (nativeTrustWouldReject(inspection, expectedVersionCode, installed)) {
        throw new Error("native verification failed");
      }
      return inspection;
    },
    verifyBenchmarkApkAsync: async () => overrides.inspection ?? validInspection(),
    canInstallPackagesAsync: async () => overrides.canInstall ?? true,
    openUnknownSourcesSettingsAsync: async () => {
      openedSettings += 1;
    },
    installApkAsync: async (...args: unknown[]) => {
      expect(args).toEqual(["file:///cache/apk-updates/zoption-20301.apk", AVAILABLE_VERSION_CODE]);
      installedApks.push(String(args[0]));
    },
  };
  const fileSystem: UpdateFileSystem = {
    ensureUpdateDirectory: async () => "file:///cache/apk-updates/",
    downloadToFile: async ({ destinationUri }) => {
      if (overrides.downloadError) throw new Error("download failed");
      return {
        uri: destinationUri,
        size: overrides.size ?? 1024,
        ...(overrides.downloadTiming ?? /* istanbul ignore next */ {}),
      };
    },
    fileSize: async () => overrides.size ?? 1024,
    deleteUri: async (uri) => {
      deleted.push(uri);
    },
    listUpdateFiles: async () => [],
  };
  return {
    deleted,
    installedApks,
    get openedSettings() {
      return openedSettings;
    },
    get fetchCount() {
      return fetchCount;
    },
    platform: "android",
    now: () => 10_000,
    fetchLatest: async () => {
      fetchCount += 1;
      if (overrides.fetchError) throw new Error("offline");
      return overrides.metadata ?? validRemoteMetadata();
    },
    native,
    fileSystem,
    loadPersistence: async () => persistence,
    savePersistence: async (next) => {
      persistence = next;
    },
    openInstallPage: async () => undefined,
    autoCheckIntervalMs: 5_000,
  };
}

describe("Android update service", () => {
  it("reports a newer version as available", async () => {
    const result = await checkForAndroidUpdate(createDeps(), { force: true });
    expect(result).toMatchObject({
      status: "available",
      latest: { versionCode: AVAILABLE_VERSION_CODE },
      installed: { versionCode: INSTALLED_VERSION_CODE },
    });
  });

  it("reports the same version as current", async () => {
    const result = await checkForAndroidUpdate(
      createDeps({ metadata: validRemoteMetadata({ version: "0.2.0-beta", versionCode: 20300 }) }),
      { force: true },
    );
    expect(result.status).toBe("current");
  });

  it("rejects an older version as a downgrade without offering an update", async () => {
    const result = await checkForAndroidUpdate(
      createDeps({ metadata: validRemoteMetadata({ versionCode: 20200 }) }),
      { force: true },
    );
    expect(result).toEqual({ status: "unavailable", reason: "downgrade" });
  });

  it("rejects malformed metadata, the wrong host, and a bad certificate", async () => {
    expect(
      await checkForAndroidUpdate(createDeps({ metadata: { version: "nope" } }), { force: true }),
    ).toEqual({ status: "unavailable", reason: "invalid-metadata" });
    expect(
      await checkForAndroidUpdate(
        createDeps({
          metadata: validRemoteMetadata({
            downloadUrl: "https://evil.example/android/zoption-beta-0.2.1.apk",
          }),
        }),
        { force: true },
      ),
    ).toEqual({ status: "unavailable", reason: "invalid-metadata" });
    expect(
      await checkForAndroidUpdate(
        createDeps({
          metadata: validRemoteMetadata({
            certificateSha256:
              "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
          }),
        }),
        { force: true },
      ),
    ).toEqual({ status: "unavailable", reason: "untrusted-signer" });
  });

  it("stays quiet on network failure", async () => {
    await expect(
      checkForAndroidUpdate(createDeps({ fetchError: true }), { force: true }),
    ).resolves.toEqual({ status: "unavailable", reason: "network" });
  });

  it("reuses a cached validated snapshot instead of refetching during the throttle window", async () => {
    const deps = createDeps({
      lastSuccessfulCheckAt: 8_000,
      lastRelease: validRemoteMetadata(),
    });
    const result = await checkForAndroidUpdate(deps, { force: false });
    expect(result.status).toBe("available");
    expect(deps.fetchCount).toBe(0);
  });

  it("always fetches on a manual check", async () => {
    const deps = createDeps({
      lastSuccessfulCheckAt: 8_000,
      lastRelease: validRemoteMetadata(),
    });
    await checkForAndroidUpdate(deps, { force: true });
    expect(deps.fetchCount).toBe(1);
  });

  it("surfaces a reinstall-required newer release without downloading", async () => {
    const result = await checkForAndroidUpdate(
      createDeps({ metadata: validRemoteMetadata({ reinstallRequired: true }) }),
      { force: true },
    );
    expect(result.status).toBe("reinstallRequired");
  });

  it("downloads, verifies, and hands a valid APK to the installer", async () => {
    const deps = createDeps();
    const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp());
    expect(result).toEqual({ status: "installed" });
    expect(deps.installedApks).toEqual(["file:///cache/apk-updates/zoption-20301.apk"]);
    expect(deps.deleted).toEqual([]);
  });

  it("discards a downloaded APK with a bad hash", async () => {
    const deps = createDeps({ digest: "bb".repeat(32) });
    const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp());
    expect(result).toEqual({
      status: "failed",
      reason: "verification",
      detail: "checksum-mismatch",
    });
    expect(deps.installedApks).toEqual([]);
    expect(deps.deleted).toContain("file:///cache/apk-updates/zoption-20301.apk");
  });

  it("discards a downloaded APK with the wrong signer", async () => {
    const deps = createDeps({
      inspection: validInspection({
        signerSha256: [
          "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
        ],
      }),
    });
    const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp());
    expect(result).toEqual({ status: "failed", reason: "verification" });
    expect(deps.installedApks).toEqual([]);
  });

  it("discards a downloaded APK with the wrong package identity", async () => {
    const deps = createDeps({
      inspection: validInspection({ packageName: "com.example.evil" }),
    });
    const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp());
    expect(result).toEqual({ status: "failed", reason: "verification" });
    expect(deps.installedApks).toEqual([]);
    expect(deps.deleted).toContain("file:///cache/apk-updates/zoption-20301.apk");
  });

  it("refuses in-place install from a dev or preview package", async () => {
    for (const packageName of ["site.zoption.android.dev", "site.zoption.android.preview"]) {
      const deps = createDeps({ installed: installedApp({ packageName }) });
      const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp({ packageName }));
      expect(result).toEqual({ status: "failed", reason: "verification" });
      expect(deps.installedApks).toEqual([]);
    }
  });

  it("pauses for unknown-sources permission instead of launching the installer", async () => {
    const deps = createDeps({ canInstall: false });
    const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp());
    expect(result).toEqual({
      status: "needs-permission",
      apkUri: "file:///cache/apk-updates/zoption-20301.apk",
    });
    expect(deps.installedApks).toEqual([]);
  });

  it("resumes installation after permission is granted", async () => {
    const deps = createDeps({ canInstall: true });
    const result = await continueAndroidInstall(
      deps,
      "file:///cache/apk-updates/zoption-20301.apk",
      parsedRelease(),
      installedApp(),
    );
    expect(result).toEqual({ status: "installed" });
    expect(deps.installedApks).toEqual(["file:///cache/apk-updates/zoption-20301.apk"]);
  });

  it("does not follow an untrusted latest.json URL", async () => {
    const fetchImpl: typeof fetch = Object.assign(
      async (url: URL | RequestInfo) => {
        expect(url).toBe("https://downloads.zoption.site/android/latest.json");
        return {
          ok: false,
          json: async () => ({}),
        } as Response;
      },
      { preconnect: () => undefined },
    );
    await expect(fetchCanonicalLatestJson(fetchImpl)).rejects.toThrow(/metadata/);
  });
});

describe("Android update timing diagnostics", () => {
  it("attaches and emits download/hash/verify timing when onStats is provided", async () => {
    const onStats = jest.fn();
    const deps = createDeps({
      downloadTiming: { transferDurationMs: 1204, transferBytesPerSecond: 115_478_569 },
    });
    const result = await applyAndroidUpdate(deps, parsedRelease(), installedApp(), {
      onStats,
    });
    expect(result.status).toBe("installed");
    expect(onStats).toHaveBeenCalledTimes(1);
    const stats = (
      onStats.mock.calls as Array<
        [
          {
            downloadMs: number;
            downloadBytesPerSecond: number;
            hashMs: number;
            verifyMs: number;
            installPrepMs: number;
            installMs: number;
          },
        ]
      >
    )[0]![0];
    expect(stats.downloadMs).toBe(1204);
    expect(stats.downloadBytesPerSecond).toBe(115_478_569);
    expect(stats.hashMs).toBeGreaterThanOrEqual(0);
    expect(stats.verifyMs).toBeGreaterThanOrEqual(0);
    expect(stats.installPrepMs).toBeGreaterThanOrEqual(0);
    expect(stats.installMs).toBeGreaterThanOrEqual(0);
    expect(result.stats).toEqual(stats);
  });

  it("omits stats from the result when onStats is not provided", async () => {
    const result = await applyAndroidUpdate(createDeps(), parsedRelease(), installedApp());
    expect(result.status).toBe("installed");
    expect("stats" in result).toBe(false);
  });
});
