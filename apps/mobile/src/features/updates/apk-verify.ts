import { certificatesMatch } from "./android-release-metadata";
import { ZOPTION_ANDROID_PACKAGE_ID, ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";

export type ApkVerifyFailureReason =
  | "checksum-mismatch"
  | "size-mismatch"
  | "package-mismatch"
  | "version-mismatch"
  | "downgrade"
  | "signer-mismatch"
  | "multiple-signers"
  | "missing-signer";

export interface ApkInspection {
  packageName: string;
  versionCode: number;
  signerSha256: readonly string[];
}

export interface ApkVerificationInput {
  downloadedSize: number;
  expectedSize: number;
  downloadedSha256: string;
  expectedSha256: string;
  inspection: ApkInspection;
  expectedVersionCode: number;
  installedVersionCode: number;
  expectedCertificateSha256: string;
}

export type ApkVerificationResult = { ok: true } | { ok: false; reason: ApkVerifyFailureReason };

export function normalizeSha256(value: string): string {
  return value.trim().toLowerCase();
}

export function verifyDownloadedApk(input: ApkVerificationInput): ApkVerificationResult {
  if (input.downloadedSize !== input.expectedSize) {
    return { ok: false, reason: "size-mismatch" };
  }
  if (normalizeSha256(input.downloadedSha256) !== normalizeSha256(input.expectedSha256)) {
    return { ok: false, reason: "checksum-mismatch" };
  }
  if (input.inspection.packageName !== ZOPTION_ANDROID_PACKAGE_ID) {
    return { ok: false, reason: "package-mismatch" };
  }
  if (input.inspection.versionCode !== input.expectedVersionCode) {
    return { ok: false, reason: "version-mismatch" };
  }
  if (input.inspection.versionCode <= input.installedVersionCode) {
    return { ok: false, reason: "downgrade" };
  }

  const signers = input.inspection.signerSha256
    .map((signer) => signer.trim())
    .filter((signer) => signer.length > 0);
  if (signers.length === 0) {
    return { ok: false, reason: "missing-signer" };
  }
  if (signers.length !== 1) {
    return { ok: false, reason: "multiple-signers" };
  }
  const signer = signers[0];
  if (
    !signer ||
    !certificatesMatch(signer, ZOPTION_ANDROID_SIGNER_SHA256) ||
    !certificatesMatch(signer, input.expectedCertificateSha256)
  ) {
    return { ok: false, reason: "signer-mismatch" };
  }
  return { ok: true };
}
