/**
 * Canonical R2 metadata object: `android/latest.json` in the
 * `zoption-android-beta` bucket.
 *
 * The remote object is untrusted input. `parseRemoteAndroidRelease` returns
 * null unless every field matches the strict shape below, the download URL
 * is HTTPS on downloads.zoption.site, and both checksums are well-formed.
 */

import type { AndroidRelease } from "./androidRelease";

export const ANDROID_LATEST_URL = "https://downloads.zoption.site/android/latest.json";
export const ANDROID_DOWNLOAD_HOST = "downloads.zoption.site";
export const ANDROID_DOWNLOAD_ORIGIN = "https://downloads.zoption.site";
export const ANDROID_DEFAULT_MINIMUM = "Android 7.0 or newer (API 24+)";

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const CERTIFICATE_COLON_HEX = /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

export function normalizeCertificateSha256(value: string): string | null {
  if (SHA256_HEX.test(value)) {
    return (value.match(/.{2}/g) ?? []).join(":").toUpperCase();
  }
  if (CERTIFICATE_COLON_HEX.test(value)) {
    return value.toUpperCase();
  }
  return null;
}

export function formatSizeLabel(sizeBytes: number): string {
  const mebibytes = sizeBytes / (1024 * 1024);
  return `${sizeBytes.toLocaleString("en-US")} bytes (${mebibytes.toFixed(2)} MiB)`;
}

export function formatReleaseDateLabel(releasedAt: string): string {
  return new Date(`${releasedAt}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Validates untrusted remote metadata and normalizes it into the same shape
 * the install page renders. Returns null for anything that fails the strict
 * schema, including non-HTTPS or foreign-host download URLs and malformed
 * checksums, so callers can safely fall back without ever rendering
 * unverified data.
 */
export function parseRemoteAndroidRelease(input: unknown): AndroidRelease | null {
  if (!isRecord(input)) return null;

  const {
    version,
    versionCode,
    downloadUrl,
    sha256,
    certificateSha256,
    size,
    releasedAt,
    reinstallRequired,
    minimumAndroidVersion,
    notes,
  } = input;

  if (!isNonEmptyString(version)) return null;
  if (!isPositiveInteger(versionCode)) return null;
  if (!isNonEmptyString(downloadUrl)) return null;

  let parsedDownloadUrl: URL;
  try {
    parsedDownloadUrl = new URL(downloadUrl);
  } catch {
    return null;
  }
  if (parsedDownloadUrl.protocol !== "https:") return null;
  if (parsedDownloadUrl.hostname !== ANDROID_DOWNLOAD_HOST) return null;
  const filename = parsedDownloadUrl.pathname.split("/").filter(Boolean).pop();
  if (!filename || !filename.endsWith(".apk")) return null;

  if (!isNonEmptyString(sha256) || !SHA256_HEX.test(sha256)) return null;
  const normalizedCertificate = isNonEmptyString(certificateSha256)
    ? normalizeCertificateSha256(certificateSha256)
    : null;
  if (normalizedCertificate === null) return null;

  if (!isPositiveInteger(size)) return null;
  if (!isNonEmptyString(releasedAt) || !ISO_DATE.test(releasedAt)) return null;
  if (typeof reinstallRequired !== "boolean") return null;

  const minimumAndroid = isNonEmptyString(minimumAndroidVersion)
    ? minimumAndroidVersion
    : ANDROID_DEFAULT_MINIMUM;

  let releaseNotes: readonly string[] | undefined;
  if (notes !== undefined) {
    if (!isStringArray(notes)) return null;
    releaseNotes = notes;
  }

  return {
    packageId: "site.zoption.android",
    versionName: version,
    versionCode,
    filename,
    downloadPath: downloadUrl,
    checksumPath: undefined,
    sha256: sha256.toLowerCase(),
    sizeBytes: size,
    sizeLabel: formatSizeLabel(size),
    releaseDate: releasedAt,
    releaseDateLabel: formatReleaseDateLabel(releasedAt),
    minimumAndroid,
    certificateSha256: normalizedCertificate,
    reinstallRequired,
    notes: releaseNotes,
  };
}
