import type { ParsedAndroidRelease } from "./android-release-metadata";
import type { ApkVerifyFailureReason } from "./apk-verify";
import type { InstalledAndroidApp } from "./update-policy";

export function formatApkSize(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1)} MB`;
}

export function formatDownloadProgress(bytesWritten: number, totalBytes: number): string {
  const total = totalBytes > 0 ? totalBytes : 0;
  if (total <= 0) {
    return `Downloading ${formatApkSize(bytesWritten)}…`;
  }
  return `Downloading ${formatApkSize(bytesWritten)} of ${formatApkSize(total)}…`;
}

export function updateAvailableMessage(
  installed: InstalledAndroidApp,
  latest: ParsedAndroidRelease,
): string {
  const notes = latest.notes.length > 0 ? `\n\n${latest.notes.join("\n")}` : "";
  return `You have ${installed.versionName}. Version ${latest.versionName} is ${formatApkSize(latest.size)}.${notes}`;
}

export function reinstallRequiredMessage(latest: ParsedAndroidRelease): string {
  return [
    `Version ${latest.versionName} cannot replace this installed copy in place.`,
    "Uninstall Zoption Beta, then download the latest official APK from the install page.",
    "Your Zoption account and synced records stay on the server.",
  ].join(" ");
}

export function verificationFailureMessage(reason: ApkVerifyFailureReason): string {
  switch (reason) {
    case "checksum-mismatch":
    case "size-mismatch":
    case "package-mismatch":
    case "version-mismatch":
    case "downgrade":
    case "signer-mismatch":
    case "multiple-signers":
    case "missing-signer":
      return "The update file could not be verified. The download was discarded.";
  }
}

export function checkFailureMessage(
  reason: "network" | "invalid-metadata" | "downgrade" | "untrusted-signer" | "unsupported",
): string {
  if (reason === "unsupported") {
    return "In-app updates are available in the official Android Beta.";
  }
  return "Unable to check for updates";
}
