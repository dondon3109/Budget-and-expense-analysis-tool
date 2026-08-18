import { ANDROID_DOWNLOAD_HOST, ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const CERTIFICATE_COLON_HEX = /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedAndroidRelease {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  sha256: string;
  certificateSha256: string;
  size: number;
  releasedAt: string;
  minimumAndroidVersion: string;
  reinstallRequired: boolean;
  notes: readonly string[];
}

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

export function certificatesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeCertificateSha256(left);
  const normalizedRight = normalizeCertificateSha256(right);
  return normalizedLeft !== null && normalizedLeft === normalizedRight;
}

export function isTrustedZoptionSigner(value: string): boolean {
  return certificatesMatch(value, ZOPTION_ANDROID_SIGNER_SHA256);
}

/**
 * Validates untrusted `latest.json` input. Returns null unless every security
 * gate passes: HTTPS, exact download host, `/android/*.apk` path, positive
 * versionCode/size, well-formed checksums, and a boolean reinstall flag.
 */
export function parseRemoteAndroidRelease(input: unknown): ParsedAndroidRelease | null {
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
  if (parsedDownloadUrl.port !== "" && parsedDownloadUrl.port !== "443") return null;
  if (parsedDownloadUrl.username || parsedDownloadUrl.password) return null;
  if (parsedDownloadUrl.pathname.includes("..")) return null;
  if (!parsedDownloadUrl.pathname.startsWith("/android/")) return null;
  const filename = parsedDownloadUrl.pathname.split("/").filter(Boolean).pop();
  if (!filename || !filename.toLowerCase().endsWith(".apk")) return null;

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
    : "Android 7.0 or newer (API 24+)";

  let releaseNotes: readonly string[] = [];
  if (notes !== undefined) {
    if (!isStringArray(notes)) return null;
    releaseNotes = notes;
  }

  return {
    versionName: version.trim(),
    versionCode,
    downloadUrl,
    sha256: sha256.toLowerCase(),
    certificateSha256: normalizedCertificate,
    size,
    releasedAt,
    minimumAndroidVersion: minimumAndroid,
    reinstallRequired,
    notes: releaseNotes,
  };
}
