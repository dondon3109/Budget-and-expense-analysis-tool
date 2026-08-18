import { requireNativeModule } from "expo";

import type { InstalledAndroidApp } from "./update-policy";
import type { ApkInspection } from "./apk-verify";

export interface ApkUpdaterNativeModule {
  getInstalledPackageInfoAsync(): Promise<InstalledAndroidApp>;
  digestFileSha256Async(fileUri: string): Promise<string>;
  inspectApkAsync(fileUri: string): Promise<ApkInspection>;
  verifyApkAsync(fileUri: string, expectedVersionCode: number): Promise<ApkInspection>;
  canInstallPackagesAsync(): Promise<boolean>;
  openUnknownSourcesSettingsAsync(): Promise<void>;
  installApkAsync(fileUri: string, expectedVersionCode: number): Promise<void>;
}

let nativeModule: ApkUpdaterNativeModule | null = null;

export function getApkUpdaterNative(): ApkUpdaterNativeModule {
  if (nativeModule) return nativeModule;
  nativeModule = requireNativeModule<ApkUpdaterNativeModule>("ZoptionApkUpdater");
  return nativeModule;
}

export function resetApkUpdaterNativeForTests(): void {
  nativeModule = null;
}
