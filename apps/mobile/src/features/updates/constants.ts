/** Metadata/policy copy of the production identity. Native code owns the installer trust anchor. */
export const ZOPTION_ANDROID_PACKAGE_ID = "site.zoption.android";
/** Metadata/policy copy of the public certificate fingerprint. Native code owns installer verification. */
export const ZOPTION_ANDROID_SIGNER_SHA256 =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";
export const ANDROID_LATEST_URL = "https://downloads.zoption.site/android/latest.json";
export const ANDROID_DOWNLOAD_HOST = "downloads.zoption.site";
export const ANDROID_INSTALL_PAGE_URL = "https://zoption.site/install";
export const UPDATE_CACHE_DIRECTORY = "apk-updates";
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const INSTALLER_RESERVATION_MS = 30 * 60 * 1000;
export const UPDATE_PERSISTENCE_KEY = "zoption-android-update-v1";
