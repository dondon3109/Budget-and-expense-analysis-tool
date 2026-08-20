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
  it("keeps the mobile version sources synchronized for the 0.2.5-beta AI entry release", async () => {
    const mobilePackage = await json<PackageManifest>(resolve(mobileRoot, "package.json"));
    const appConfig = await text(resolve(mobileRoot, "app.config.ts"));

    // The build-time snapshot (androidRelease.json) is refreshed from the
    // published R2 object after the CI build produces its artifact checksums;
    // the authoritative mobile sources change together here.
    expect(mobilePackage.version).toBe("0.2.5-beta");
    expect(appConfig).toContain('version: "0.2.5-beta"');
    expect(appConfig).toContain("versionCode: 20305");
    expect(ANDROID_RELEASE.packageId).toBe("site.zoption.android");
    expect(appConfig).toContain('name: "Zoption Beta"');
    expect(appConfig).toContain('androidPackage: "site.zoption.android"');
  });

  it("hosts the beta artifact on the Zoption R2 download domain", () => {
    expect(ANDROID_RELEASE.downloadPath).toBe(
      "https://downloads.zoption.site/android/zoption-beta-0.2.4.apk",
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

  it("records exact immutable artifact metadata for integrity checks", () => {
    expect(ANDROID_RELEASE).toMatchObject({
      packageId: "site.zoption.android",
      versionName: "0.2.4-beta",
      versionCode: 20304,
      targetApi: 36,
      reinstallRequired: false,
    });
    expect(ANDROID_RELEASE.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ANDROID_RELEASE.sizeBytes).toBeGreaterThan(1_000_000);
    expect(ANDROID_RELEASE.minimumAndroid).toContain("Android");
    expect(ANDROID_RELEASE.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ANDROID_RELEASE.certificateSha256).toBe(
      "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D",
    );
    expect(ANDROID_RELEASE.notes?.length).toBeGreaterThanOrEqual(3);
  });
});
