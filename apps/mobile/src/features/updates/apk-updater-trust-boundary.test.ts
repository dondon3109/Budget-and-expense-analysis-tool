import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ZOPTION_ANDROID_PACKAGE_ID, ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";

const mobileRoot = resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8");
}

describe("native updater trust boundary", () => {
  const trust = read(
    "modules/zoption-apk-updater/android/src/main/java/site/zoption/apkupdater/ZoptionApkTrust.kt",
  );
  const native = read(
    "modules/zoption-apk-updater/android/src/main/java/site/zoption/apkupdater/ZoptionApkUpdaterModule.kt",
  );
  const jsNative = read("src/features/updates/apk-updater-native.ts");
  const service = read("src/features/updates/update-service.ts");
  const ios = read("modules/zoption-apk-updater/ios/ZoptionApkUpdaterModule.swift");

  it("embeds the production package and public signer in native code", () => {
    expect(trust).toContain(`TRUSTED_PACKAGE_ID = "${ZOPTION_ANDROID_PACKAGE_ID}"`);
    expect(trust).toContain(`TRUSTED_SIGNER_SHA256 =\n    "${ZOPTION_ANDROID_SIGNER_SHA256}"`);
    expect(trust).toContain("internal object ZoptionApkTrust");
    expect(trust).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/);
    expect(trust).not.toContain("fun setTrusted");
    expect(trust).not.toContain("var TRUSTED_PACKAGE_ID");
    expect(trust).not.toContain("var TRUSTED_SIGNER_SHA256");
  });

  it("does not let JS supply an expected package or signer to native verification", () => {
    expect(jsNative).toMatch(/downloadApkAsync\(/);
    expect(jsNative).toMatch(/cancelApkDownloadAsync\(downloadId: string\)/);
    expect(jsNative).toMatch(/verifyApkAsync\(fileUri: string, expectedVersionCode: number\)/);
    expect(jsNative).toMatch(
      /verifyBenchmarkApkAsync\(fileUri: string, expectedVersionCode: number\)/,
    );
    expect(jsNative).toMatch(/installApkAsync\(fileUri: string, expectedVersionCode: number\)/);
    expect(jsNative).not.toMatch(/expectedPackage/);
    expect(jsNative).not.toMatch(/expectedSigner/);

    expect(native).toContain('AsyncFunction("downloadApkAsync") Coroutine');
    expect(native).toContain('AsyncFunction("cancelApkDownloadAsync") { downloadId: String ->');
    expect(native).toContain(
      'AsyncFunction("verifyApkAsync") { fileUri: String, expectedVersionCode: Int ->',
    );
    expect(native).toContain(
      'AsyncFunction("verifyBenchmarkApkAsync") { fileUri: String, expectedVersionCode: Int ->',
    );
    expect(native).toContain(
      'AsyncFunction("installApkAsync") { fileUri: String, expectedVersionCode: Int ->',
    );
    expect(native).not.toContain("expectedPackage");
    expect(native).not.toContain("expectedSigner");
    expect(ios).toContain('AsyncFunction("verifyApkAsync") { (_: String, _: Int)');
    expect(ios).toContain(
      'AsyncFunction("downloadApkAsync") { (_: String, _: String, _: String, _: Int)',
    );
    expect(ios).toContain('AsyncFunction("cancelApkDownloadAsync") { (_: String)');
    expect(ios).toContain('AsyncFunction("verifyBenchmarkApkAsync") { (_: String, _: Int)');
    expect(ios).toContain('AsyncFunction("installApkAsync") { (_: String, _: Int)');
  });

  it("re-verifies with native constants before opening the installer", () => {
    expect(native).toContain("verifyTrustedApk(file, expectedVersionCode)");
    expect(native).toContain("ZoptionApkTrust.evaluate");
    expect(native).toContain("runningPackageName = context.packageName");
    expect(trust).toContain("runningPackageName != TRUSTED_PACKAGE_ID");
    expect(trust).toContain("inspection.packageName != TRUSTED_PACKAGE_ID");
    expect(trust).toContain("signers.first() != TRUSTED_SIGNER_SHA256");
    expect(trust).toContain("signers.size != 1");
    expect(trust).toContain("fun evaluateBenchmarkArchive");
    expect(native).toContain("verifyTrustedBenchmarkArchive");
    expect(native).toContain("ZoptionApkTrust.evaluateBenchmarkArchive");
  });

  it("JS only forwards the dynamic versionCode into native install", () => {
    expect(service).toContain("deps.native.verifyApkAsync(downloaded.uri, release.versionCode)");
    expect(service).toContain("deps.native.installApkAsync(apkUri, release.versionCode)");
    expect(service).not.toMatch(/installApkAsync\([^)]*ZOPTION_ANDROID_PACKAGE_ID/);
    expect(service).not.toMatch(/installApkAsync\([^)]*ZOPTION_ANDROID_SIGNER_SHA256/);
    expect(service).not.toContain("ZOPTION_ANDROID_PACKAGE_ID");
    expect(service).not.toContain("ZOPTION_ANDROID_SIGNER_SHA256");
    expect(service).not.toContain("verifyBenchmarkApkAsync");
  });
});
