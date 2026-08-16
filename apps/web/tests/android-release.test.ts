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
  it("keeps the beta release metadata synchronized with the mobile app config", async () => {
    const mobilePackage = await json<PackageManifest>(resolve(mobileRoot, "package.json"));
    const appConfig = await text(resolve(mobileRoot, "app.config.ts"));

    expect(ANDROID_RELEASE.versionName).toBe(mobilePackage.version);
    expect(ANDROID_RELEASE.versionCode).toBe(20200);
    expect(ANDROID_RELEASE.packageId).toBe("site.zoption.android");
    expect(ANDROID_RELEASE.filename).toBe(`zoption-beta-${mobilePackage.version}.apk`);
    expect(appConfig).toContain('name: "Zoption Beta"');
    expect(appConfig).toContain('androidPackage: "site.zoption.android"');
    expect(appConfig).toContain("versionCode: 20200");
  });

  it("hosts the beta artifact on the public GitHub release behind the website link", () => {
    const base =
      "https://github.com/dondon3109/Budget-and-expense-analysis-tool/releases/download/android-beta-0.1.0";
    expect(ANDROID_RELEASE.downloadPath).toBe(`${base}/${ANDROID_RELEASE.filename}`);
    expect(ANDROID_RELEASE.checksumPath).toBe(
      `${base}/${ANDROID_RELEASE.filename}.sha256`,
    );
  });

  it("keeps APK binaries and signing keys out of Git source", async () => {
    const gitignore = await text(resolve(repositoryRoot, ".gitignore"));

    expect(gitignore).toMatch(/\*\.jks|\*\.keystore/);
    expect(gitignore).toMatch(/\*\.apk/);
  });

  it("records exact immutable artifact metadata for integrity checks", () => {
    expect(ANDROID_RELEASE).toMatchObject({
      packageId: "site.zoption.android",
      versionName: "0.1.0",
      versionCode: 20200,
      targetApi: 36,
    });
    expect(ANDROID_RELEASE.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ANDROID_RELEASE.sizeBytes).toBeGreaterThan(1_000_000);
    expect(ANDROID_RELEASE.minimumAndroid).toContain("Android");
    expect(ANDROID_RELEASE.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ANDROID_RELEASE.certificateSha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});
