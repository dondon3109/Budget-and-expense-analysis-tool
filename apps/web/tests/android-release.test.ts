import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ANDROID_RELEASE } from "../src/releases/androidRelease";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const mobileRoot = resolve(repositoryRoot, "apps/mobile");

async function text(path: string) {
  return readFile(path, "utf8");
}

async function json<T>(path: string): Promise<T> {
  const parsed: unknown = JSON.parse(await text(path));
  return parsed as T;
}

interface PackageManifest {
  version: string;
}

describe("Android release contract", () => {
  it("keeps the Android release version single-sourced in package.json", async () => {
    const mobilePackage = await json<PackageManifest>(resolve(mobileRoot, "package.json"));
    const appConfig = await text(resolve(mobileRoot, "app.config.ts"));

    // package.json is the only hand-maintained copy of the release version;
    // app.config.ts must derive its version from there instead of duplicating
    // a literal, so a bump never requires touching this test.
    expect(mobilePackage.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(appConfig).toContain('import packageJson from "./package.json"');
    expect(appConfig).not.toMatch(/version: "\d/);
    // The Android versionCode counter stays an explicit literal in one place.
    expect(appConfig).toMatch(/versionCode: \d+,/);
    expect(ANDROID_RELEASE.packageId).toBe("site.zoption.android");
    expect(appConfig).toContain('name: "Zoption Beta"');
    expect(appConfig).toContain('androidPackage: "site.zoption.android"');
  });

  it("hosts the beta artifact on the Zoption R2 download domain", () => {
    expect(ANDROID_RELEASE.downloadPath).toBe(
      "https://downloads.zoption.site/android/" + ANDROID_RELEASE.filename,
    );
    expect(ANDROID_RELEASE.downloadPath).toMatch(
      /^https:\/\/downloads\.zoption\.site\/android\/[a-z0-9.-]+\.apk$/,
    );
    // No checksum sidecar is published on R2; the APK checksum lives in
    // android/latest.json and is shown on the install page.
    expect(ANDROID_RELEASE.checksumPath).toBeUndefined();
  });

  it("keeps APK binaries and signing keys out of Git source", async () => {
    const gitignore = await text(resolve(repositoryRoot, ".gitignore"));

    expect(gitignore).toMatch(/\*\.jks|\*\.keystore/);
    expect(gitignore).toMatch(/\*\.apk/);
  });

  it("records well-formed artifact metadata for integrity checks", () => {
    // Values change with every publish; only their shape and the permanent
    // signing identity are contractual here.
    expect(ANDROID_RELEASE).toMatchObject({
      packageId: "site.zoption.android",
      targetApi: 36,
      reinstallRequired: false,
    });
    expect(ANDROID_RELEASE.versionName).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(ANDROID_RELEASE.versionCode).toBeGreaterThan(0);
    expect(Number.isInteger(ANDROID_RELEASE.versionCode)).toBe(true);
    expect(ANDROID_RELEASE.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ANDROID_RELEASE.sizeBytes).toBeGreaterThan(1_000_000);
    expect(ANDROID_RELEASE.minimumAndroid).toContain("Android");
    expect(ANDROID_RELEASE.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The fallback must always advertise the permanent Zoption signing key.
    expect(ANDROID_RELEASE.certificateSha256).toBe(
      "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D",
    );
    // The publisher accepts one or more concise release-note lines and
    // deliberately supplies a single fallback line when none are provided.
    expect(ANDROID_RELEASE.notes?.length).toBeGreaterThanOrEqual(1);
  });
});
