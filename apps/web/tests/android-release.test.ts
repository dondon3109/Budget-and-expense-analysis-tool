import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ANDROID_RELEASE } from "../src/releases/androidRelease";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const androidRoot = resolve(repositoryRoot, "apps/android");
const webRoot = resolve(repositoryRoot, "apps/web");

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

interface TwaManifest {
  packageId: string;
  host: string;
  startUrl: string;
  display: string;
  orientation: string;
  minSdkVersion: number;
  fullScopeUrl: string;
  enableNotifications: boolean;
  appVersionCode: number;
  appVersionName: string;
  fingerprints: Array<{ name: string; value: string }>;
}

interface AssetLinkStatement {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

describe("Android release contract", () => {
  it("keeps web and Android versions synchronized with a deterministic version code", async () => {
    const rootPackage = await json<PackageManifest>(resolve(repositoryRoot, "package.json"));
    const androidPackage = await json<PackageManifest>(resolve(androidRoot, "package.json"));
    const twaManifest = await json<TwaManifest>(resolve(androidRoot, "twa-manifest.json"));
    const [major = Number.NaN, minor = Number.NaN, patch = Number.NaN] = rootPackage.version
      .split(".")
      .map(Number);
    expect([major, minor, patch].every(Number.isInteger)).toBe(true);
    const expectedCode = major * 10_000 + minor * 100 + patch;

    expect(ANDROID_RELEASE.versionName).toBe(rootPackage.version);
    expect(androidPackage.version).toBe(rootPackage.version);
    expect(ANDROID_RELEASE.versionCode).toBe(expectedCode);
    expect(twaManifest.appVersionCode).toBe(expectedCode);
    expect(twaManifest.appVersionName).toBe(rootPackage.version);
    expect(ANDROID_RELEASE.filename).toBe(`zoption-android-${rootPackage.version}.apk`);
  });

  it("binds the production domain to the final release certificate", async () => {
    const statements = await json<AssetLinkStatement[]>(
      resolve(webRoot, "public/.well-known/assetlinks.json"),
    );
    const twaManifest = await json<TwaManifest>(resolve(androidRoot, "twa-manifest.json"));

    expect(statements).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_RELEASE.packageId,
          sha256_cert_fingerprints: [ANDROID_RELEASE.certificateSha256],
        },
      },
    ]);
    expect(twaManifest.fingerprints).toContainEqual({
      name: "release",
      value: ANDROID_RELEASE.certificateSha256,
    });
  });

  it("defines the intended fullscreen, production-only TWA and verified app link", async () => {
    const twaManifest = await json<TwaManifest>(resolve(androidRoot, "twa-manifest.json"));
    const gradle = await text(resolve(androidRoot, "app/build.gradle"));
    const manifest = await text(resolve(androidRoot, "app/src/main/AndroidManifest.xml"));

    expect(twaManifest).toMatchObject({
      packageId: ANDROID_RELEASE.packageId,
      host: "zoption.site",
      startUrl: "/app",
      display: "fullscreen",
      orientation: "any",
      minSdkVersion: 21,
      fullScopeUrl: "https://zoption.site/",
      enableNotifications: false,
    });
    expect(gradle).toContain("compileSdkVersion 36");
    expect(gradle).toContain("targetSdkVersion 36");
    expect(gradle).toContain("minSdkVersion 21");
    expect(gradle).toContain("shrinkResources true");
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:scheme="https"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).not.toMatch(/POST_NOTIFICATIONS|CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION/);
  });

  it("publishes immutable APK headers and keeps binaries and keys out of Git source", async () => {
    const headers = await text(resolve(webRoot, "public/_headers"));
    const gitignore = await text(resolve(repositoryRoot, ".gitignore"));

    expect(headers).toContain(`/downloads/${ANDROID_RELEASE.filename}`);
    expect(headers).toContain("Content-Type: application/vnd.android.package-archive");
    expect(headers).toContain(
      `Content-Disposition: attachment; filename="${ANDROID_RELEASE.filename}"`,
    );
    expect(headers).toContain("Cache-Control: public, max-age=31536000, immutable");
    expect(headers).toContain("/.well-known/assetlinks.json");
    expect(gitignore).toMatch(/\*\.jks|apps\/android\/\*\.apk|apps\/web\/public\/downloads\//);
  });

  it("records exact immutable artifact metadata for staging and integrity checks", () => {
    expect(ANDROID_RELEASE).toMatchObject({
      downloadPath: `/downloads/${ANDROID_RELEASE.filename}`,
      checksumPath: `/downloads/${ANDROID_RELEASE.filename}.sha256`,
      sizeBytes: 2_104_552,
      releaseDate: "2026-08-10",
      targetApi: 36,
    });
    expect(ANDROID_RELEASE.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
