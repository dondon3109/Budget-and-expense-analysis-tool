import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";

const moduleRoot = resolve(__dirname, "../../../modules/zoption-apk-updater");

function read(relativePath: string): string {
  return readFileSync(resolve(moduleRoot, relativePath), "utf8");
}

describe("native APK updater configuration", () => {
  it("declares only the install-packages permission and a private FileProvider", () => {
    const manifest = read("android/src/main/AndroidManifest.xml");
    expect(manifest).toContain("android.permission.REQUEST_INSTALL_PACKAGES");
    expect(manifest).not.toContain("READ_EXTERNAL_STORAGE");
    expect(manifest).not.toContain("WRITE_EXTERNAL_STORAGE");
    expect(manifest).not.toContain("MANAGE_EXTERNAL_STORAGE");
    expect(manifest).toContain("${applicationId}.zoption.apkupdater");
    expect(manifest).toContain('android:exported="false"');
    expect(manifest).toContain('android:grantUriPermissions="true"');
    expect(manifest).toContain("application/vnd.android.package-archive");
  });

  it("exposes only the updater cache directory through FileProvider", () => {
    const paths = read("android/src/main/res/xml/zoption_apk_updater_paths.xml");
    expect(paths).toContain('path="apk-updates/"');
    expect(paths).not.toContain('path="."');
    expect(paths).not.toContain("external-path");
  });

  it("inspects signers on API 24+ and never launches an unverified installer", () => {
    const source = read("android/src/main/java/site/zoption/apkupdater/ZoptionApkUpdaterModule.kt");
    expect(source).toContain("GET_SIGNING_CERTIFICATES");
    expect(source).toContain("GET_SIGNATURES");
    expect(source).toContain("hasMultipleSigners");
    expect(source).toContain("apkContentsSigners");
    expect(source).toContain("verifyTrustedApk");
    expect(source).toContain("FLAG_GRANT_READ_URI_PERMISSION");
    expect(source).toContain("application/vnd.android.package-archive");
    expect(source).toContain("cacheDir, UPDATE_CACHE_DIRECTORY");
    expect(source).toContain("canonicalFile");
    expect(source).toContain("ACTION_MANAGE_UNKNOWN_APP_SOURCES");
    expect(source).not.toContain('INSTALL_PACKAGES"');
    expect(source).not.toContain("su ");
    expect(source).not.toContain("DEVICE_OWNER");
    expect(source.toLowerCase()).not.toContain("androidkeystorepassword");
    expect(source).not.toContain("expectedPackage");
    expect(source).not.toContain("expectedSigner");
  });

  it("streams APKs natively without progress events and pins the download boundary", () => {
    const moduleSource = read(
      "android/src/main/java/site/zoption/apkupdater/ZoptionApkUpdaterModule.kt",
    );
    const downloader = read(
      "android/src/main/java/site/zoption/apkupdater/ZoptionApkDownloader.kt",
    );
    expect(moduleSource).toContain('AsyncFunction("downloadApkAsync") Coroutine');
    expect(moduleSource).toContain('AsyncFunction("cancelApkDownloadAsync")');
    expect(downloader).toContain('TRUSTED_DOWNLOAD_HOST = "downloads.zoption.site"');
    expect(downloader).toContain(".followRedirects(false)");
    expect(downloader).toContain(".followSslRedirects(false)");
    expect(downloader).toContain('.header("Accept-Encoding", "identity")');
    expect(downloader).toContain("body.contentLength() != expectedSize");
    expect(downloader).toContain("totalBytes > expectedSize");
    expect(downloader).toContain("COPY_BUFFER_BYTES = 256 * 1024");
    expect(downloader).toContain("activeDownloads[downloadId]?.cancel()");
    expect(downloader).not.toContain("sendEvent");
    expect(downloader).not.toContain("downloadProgress");
  });

  it("does not embed the private signing key", () => {
    const moduleSource = read(
      "android/src/main/java/site/zoption/apkupdater/ZoptionApkUpdaterModule.kt",
    );
    const trust = read("android/src/main/java/site/zoption/apkupdater/ZoptionApkTrust.kt");
    for (const source of [moduleSource, trust]) {
      expect(source).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/);
      expect(source).not.toContain("storePassword");
      expect(source).not.toContain("keyPassword");
    }
    expect(trust).toContain(ZOPTION_ANDROID_SIGNER_SHA256);
  });
});
