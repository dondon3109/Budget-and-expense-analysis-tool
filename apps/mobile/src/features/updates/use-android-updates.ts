import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, InteractionManager, Platform } from "react-native";

import type { ParsedAndroidRelease } from "./android-release-metadata";
import {
  applyAndroidUpdate,
  checkForAndroidUpdate,
  continueAndroidInstall,
  createDefaultUpdateDependencies,
  promptVisibleForCheck,
  type ApplyUpdateResult,
  type UpdateCheckResult,
  type UpdateServiceDependencies,
  type UpdateTiming,
} from "./update-service";
import { checkFailureMessage, verificationFailureMessage } from "./update-copy";
import type { DownloadProgress } from "./update-filesystem";
import { loadUpdatePersistence, saveUpdatePersistence } from "./update-persistence";
import type { InstalledAndroidApp } from "./update-policy";

export type ManualUpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "reinstallRequired"
  | "error"
  | "downloading"
  | "verifying"
  | "needsPermission"
  | "installing"
  | "failed";

export interface AndroidUpdateController {
  supported: boolean;
  status: ManualUpdateStatus;
  installed: InstalledAndroidApp | null;
  latest: ParsedAndroidRelease | null;
  error: string | null;
  progress: DownloadProgress | null;
  /** Most recent measured phase timings for the last update attempt (no sensitive data). */
  timing: UpdateTiming | null;
  prompt: "hidden" | "available" | "reinstallRequired";
  check: () => Promise<void>;
  updateNow: () => Promise<void>;
  later: () => Promise<void>;
  cancelDownload: () => void;
  openInstallPage: () => Promise<void>;
  openUnknownSourcesSettings: () => Promise<void>;
}

const AndroidUpdateContext = createContext<AndroidUpdateController | null>(null);

export function useAndroidUpdates(): AndroidUpdateController {
  const value = useContext(AndroidUpdateContext);
  if (!value) {
    throw new Error("Android update UI must be rendered inside AndroidUpdateProvider.");
  }
  return value;
}

export function useOptionalAndroidUpdates(): AndroidUpdateController | null {
  return useContext(AndroidUpdateContext);
}

export function useAndroidUpdateController(
  dependencies?: Partial<UpdateServiceDependencies>,
): AndroidUpdateController {
  const deps = useMemo(
    () => ({
      ...createControllerDependencies(),
      ...dependencies,
      platform: dependencies?.platform ?? Platform.OS,
    }),
    [dependencies],
  );
  const supported = deps.platform === "android";
  const [status, setStatus] = useState<ManualUpdateStatus>("idle");
  const [installed, setInstalled] = useState<InstalledAndroidApp | null>(null);
  const [latest, setLatest] = useState<ParsedAndroidRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [timing, setTiming] = useState<UpdateTiming | null>(null);
  const [prompt, setPrompt] = useState<"hidden" | "available" | "reinstallRequired">("hidden");
  const [pendingApkUri, setPendingApkUri] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightCheck = useRef<Promise<void> | null>(null);
  const latestRef = useRef<ParsedAndroidRelease | null>(null);
  const installedRef = useRef<InstalledAndroidApp | null>(null);

  latestRef.current = latest;
  installedRef.current = installed;

  const applyCheckResult = useCallback(
    async (result: UpdateCheckResult, options: { showPrompt: boolean }) => {
      if (result.status === "current") {
        setInstalled(result.installed);
        setLatest(result.latest);
        setStatus("current");
        setError(null);
        setPrompt("hidden");
        return;
      }
      if (result.status === "available" || result.status === "reinstallRequired") {
        setInstalled(result.installed);
        setLatest(result.latest);
        setStatus(result.status);
        setError(null);
        if (options.showPrompt) {
          const persistence = await deps.loadPersistence();
          setPrompt(promptVisibleForCheck(result, persistence) ? result.status : "hidden");
        }
        return;
      }
      setStatus("error");
      setError(checkFailureMessage(result.reason));
      setPrompt("hidden");
    },
    [deps],
  );

  const check = useCallback(async () => {
    if (!supported) {
      setStatus("error");
      setError(checkFailureMessage("unsupported"));
      return;
    }
    if (inFlightCheck.current) {
      await inFlightCheck.current;
      return;
    }
    setStatus("checking");
    setError(null);
    const work = (async () => {
      try {
        const result = await checkForAndroidUpdate(deps, { force: true });
        await applyCheckResult(result, { showPrompt: false });
      } catch {
        setStatus("error");
        setError(checkFailureMessage("network"));
      }
    })();
    inFlightCheck.current = work;
    try {
      await work;
    } finally {
      inFlightCheck.current = null;
    }
  }, [applyCheckResult, deps, supported]);

  const later = useCallback(async () => {
    setPrompt("hidden");
    const current = latestRef.current;
    if (!current) return;
    const persistence = await deps.loadPersistence();
    await deps.savePersistence({
      ...persistence,
      dismissedVersionCode: current.versionCode,
    });
  }, [deps]);

  const cancelDownload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleApplyResult = useCallback((result: ApplyUpdateResult) => {
    setProgress(null);
    if (result.status === "installed") {
      setStatus("installing");
      setPendingApkUri(null);
      setError(null);
      return;
    }
    if (result.status === "needs-permission") {
      setPendingApkUri(result.apkUri);
      setStatus("needsPermission");
      setError(null);
      return;
    }
    if (result.status === "cancelled") {
      setStatus(latestRef.current ? "available" : "idle");
      setError(null);
      return;
    }
    setStatus("failed");
    setPendingApkUri(null);
    if (result.reason === "verification" && result.detail) {
      setError(verificationFailureMessage(result.detail));
      return;
    }
    if (result.reason === "download") {
      setError("The update could not be downloaded. Try again when you have a stable connection.");
      return;
    }
    setError("Android could not open the package installer.");
  }, []);

  const recordTiming = useCallback((next: UpdateTiming) => {
    if (!next) return;
    setTiming(next);
    if (__DEV__) {
      // Timing telemetry is limited to durations/throughput and never includes
      // the download URL, paths, hashes, or certificate data.
      const mbps = (next.downloadBytesPerSecond / 1024 / 1024).toFixed(1);
      console.info(
        "[update] download " + mbps + " MB/s (" + next.downloadMs + "ms) hash " + next.hashMs +
          "ms verify " + next.verifyMs + "ms install " + next.installMs + "ms (prep " + next.installPrepMs + "ms)",
      );
    }
  }, []);

  const updateNow = useCallback(async () => {
    const release = latestRef.current;
    const currentInstall = installedRef.current;
    if (!release || !currentInstall) return;
    if (latestRef.current?.reinstallRequired) {
      await deps.openInstallPage();
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPrompt("hidden");
    setStatus("downloading");
    setProgress({ bytesWritten: 0, totalBytes: release.size });
    setError(null);
    const result = await applyAndroidUpdate(deps, release, currentInstall, {
      signal: controller.signal,
      onPhase: (phase) => {
        if (phase === "verifying") setStatus("verifying");
        if (phase === "installing") setStatus("installing");
      },
      onProgress: (next) => {
        setStatus("downloading");
        setProgress(next);
      },
      onStats: recordTiming,
    });
    handleApplyResult(result);
  }, [deps, handleApplyResult, recordTiming]);

  const openInstallPage = useCallback(async () => {
    try {
      await deps.openInstallPage();
    } catch {
      setError("The install page could not be opened.");
    }
  }, [deps]);

  const openUnknownSourcesSettings = useCallback(async () => {
    try {
      await deps.native.openUnknownSourcesSettingsAsync();
    } catch {
      setError("Android settings for installing unknown apps could not be opened.");
    }
  }, [deps]);

  const retryAfterPermission = useCallback(async () => {
    const release = latestRef.current;
    const apkUri = pendingApkUri;
    if (!release || !apkUri || status !== "needsPermission") return;
    setStatus("installing");
    const currentInstall = installedRef.current;
    if (!currentInstall) return;
    const result = await continueAndroidInstall(deps, apkUri, release, currentInstall, {
      onStats: recordTiming,
    });
    handleApplyResult(result);
  }, [deps, handleApplyResult, pendingApkUri, recordTiming, status]);

  useEffect(() => {
    if (!supported) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const current = await deps.native.getInstalledPackageInfoAsync();
          setInstalled({
            packageName: current.packageName,
            versionName: current.versionName,
            versionCode: Number(current.versionCode),
          });
        } catch {
          // The version label can stay unknown until a manual check.
        }
        try {
          const result = await checkForAndroidUpdate(deps, { force: false });
          if (result.status === "unavailable") return;
          await applyCheckResult(result, { showPrompt: true });
        } catch {
          // Automatic checks stay quiet on unexpected failure.
        }
      })();
    });
    return () => handle.cancel();
  }, [applyCheckResult, deps, supported]);

  useEffect(() => {
    if (!supported) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void retryAfterPermission();
      }
    });
    return () => subscription.remove();
  }, [retryAfterPermission, supported]);

  return {
    supported,
    status,
    installed,
    latest,
    error,
    progress,
    timing,
    prompt,
    check,
    updateNow,
    later,
    cancelDownload,
    openInstallPage,
    openUnknownSourcesSettings,
  };
}

function createControllerDependencies(): UpdateServiceDependencies {
  if (Platform.OS !== "android") {
    return unsupportedUpdateDependencies(Platform.OS);
  }
  try {
    return createDefaultUpdateDependencies();
  } catch {
    return unsupportedUpdateDependencies("android");
  }
}

function unsupportedUpdateDependencies(platform: string): UpdateServiceDependencies {
  return {
    platform,
    now: () => Date.now(),
    fetchLatest: () => Promise.resolve(null),
    native: {
      getInstalledPackageInfoAsync: () => Promise.reject(new Error("unsupported")),
      digestFileSha256Async: () => Promise.reject(new Error("unsupported")),
      inspectApkAsync: () => Promise.reject(new Error("unsupported")),
      verifyApkAsync: () => Promise.reject(new Error("unsupported")),
      canInstallPackagesAsync: () => Promise.resolve(false),
      openUnknownSourcesSettingsAsync: () => Promise.resolve(),
      installApkAsync: () => Promise.resolve(),
    },
    fileSystem: {
      ensureUpdateDirectory: () => Promise.resolve(""),
      downloadToFile: () => Promise.resolve({ uri: "", size: 0 }),
      fileSize: () => Promise.resolve(0),
      deleteUri: () => Promise.resolve(),
      listUpdateFiles: () => Promise.resolve([]),
    },
    loadPersistence: () => loadUpdatePersistence(),
    savePersistence: (state) => saveUpdatePersistence(state),
    openInstallPage: () => Promise.resolve(),
    autoCheckIntervalMs: 0,
  };
}

export const AndroidUpdateContextProvider = AndroidUpdateContext.Provider;
