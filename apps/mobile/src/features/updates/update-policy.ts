import { isTrustedZoptionSigner, type ParsedAndroidRelease } from "./android-release-metadata";
import { ZOPTION_ANDROID_PACKAGE_ID } from "./constants";

export type VersionComparison = "available" | "current" | "downgrade";

export interface InstalledAndroidApp {
  packageName: string;
  versionName: string;
  versionCode: number;
}

export type UpdateDecision =
  | { status: "unsupported"; reason: "wrong-platform" | "wrong-package" }
  | { status: "invalid-metadata" }
  | { status: "untrusted-signer" }
  | { status: "downgrade" }
  | { status: "current"; installed: InstalledAndroidApp; latest: ParsedAndroidRelease }
  | { status: "available"; installed: InstalledAndroidApp; latest: ParsedAndroidRelease }
  | { status: "reinstallRequired"; installed: InstalledAndroidApp; latest: ParsedAndroidRelease };

export function compareVersionCodes(latest: number, installed: number): VersionComparison {
  if (latest > installed) return "available";
  if (latest === installed) return "current";
  return "downgrade";
}

export function decideUpdateAction(input: {
  platform: string;
  installed: InstalledAndroidApp | null;
  latest: ParsedAndroidRelease | null;
}): UpdateDecision {
  if (input.platform !== "android") {
    return { status: "unsupported", reason: "wrong-platform" };
  }
  if (!input.installed || input.installed.packageName !== ZOPTION_ANDROID_PACKAGE_ID) {
    return { status: "unsupported", reason: "wrong-package" };
  }
  if (!input.latest) {
    return { status: "invalid-metadata" };
  }
  if (!isTrustedZoptionSigner(input.latest.certificateSha256)) {
    return { status: "untrusted-signer" };
  }

  const comparison = compareVersionCodes(input.latest.versionCode, input.installed.versionCode);
  if (comparison === "downgrade") return { status: "downgrade" };
  if (comparison === "current") {
    return { status: "current", installed: input.installed, latest: input.latest };
  }
  if (input.latest.reinstallRequired) {
    return { status: "reinstallRequired", installed: input.installed, latest: input.latest };
  }
  return { status: "available", installed: input.installed, latest: input.latest };
}
