import { ZOPTION_ANDROID_PACKAGE_ID, ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";
import type { ParsedAndroidRelease } from "./android-release-metadata";
import type { InstalledAndroidApp } from "./update-policy";
import type { ApkInspection } from "./apk-verify";

export const INSTALLED_VERSION_CODE = 20300;
export const AVAILABLE_VERSION_CODE = 20301;
export const VALID_APK_SHA256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export function installedApp(overrides: Partial<InstalledAndroidApp> = {}): InstalledAndroidApp {
  return {
    packageName: ZOPTION_ANDROID_PACKAGE_ID,
    versionName: "0.2.0-beta",
    versionCode: INSTALLED_VERSION_CODE,
    ...overrides,
  };
}

export function validRemoteMetadata(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: "0.2.1-beta",
    versionCode: AVAILABLE_VERSION_CODE,
    downloadUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.1.apk",
    sha256: VALID_APK_SHA256,
    certificateSha256: ZOPTION_ANDROID_SIGNER_SHA256,
    size: 1024,
    releasedAt: "2026-08-19",
    minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
    reinstallRequired: false,
    notes: ["Receipt scan polish and in-app updates."],
    ...overrides,
  };
}

export function parsedRelease(overrides: Partial<ParsedAndroidRelease> = {}): ParsedAndroidRelease {
  return {
    versionName: "0.2.1-beta",
    versionCode: AVAILABLE_VERSION_CODE,
    downloadUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.1.apk",
    sha256: VALID_APK_SHA256,
    certificateSha256: ZOPTION_ANDROID_SIGNER_SHA256,
    size: 1024,
    releasedAt: "2026-08-19",
    minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
    reinstallRequired: false,
    notes: ["Receipt scan polish and in-app updates."],
    ...overrides,
  };
}

export function validInspection(overrides: Partial<ApkInspection> = {}): ApkInspection {
  return {
    packageName: ZOPTION_ANDROID_PACKAGE_ID,
    versionCode: AVAILABLE_VERSION_CODE,
    signerSha256: [ZOPTION_ANDROID_SIGNER_SHA256],
    ...overrides,
  };
}
