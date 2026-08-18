import { ZOPTION_ANDROID_PACKAGE_ID, ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";
import { verifyDownloadedApk } from "./apk-verify";
import {
  AVAILABLE_VERSION_CODE,
  INSTALLED_VERSION_CODE,
  VALID_APK_SHA256,
  validInspection,
} from "./test-fixtures";

function input(overrides: Partial<Parameters<typeof verifyDownloadedApk>[0]> = {}) {
  return {
    downloadedSize: 1024,
    expectedSize: 1024,
    downloadedSha256: VALID_APK_SHA256,
    expectedSha256: VALID_APK_SHA256.toUpperCase(),
    inspection: validInspection(),
    expectedVersionCode: AVAILABLE_VERSION_CODE,
    installedVersionCode: INSTALLED_VERSION_CODE,
    expectedCertificateSha256: ZOPTION_ANDROID_SIGNER_SHA256,
    ...overrides,
  };
}

describe("downloaded APK verification", () => {
  it("accepts a matching package, version, checksum, size, and single trusted signer", () => {
    expect(verifyDownloadedApk(input())).toEqual({ ok: true });
  });

  it("rejects a checksum mismatch", () => {
    expect(verifyDownloadedApk(input({ downloadedSha256: "bb".repeat(32) }))).toEqual({
      ok: false,
      reason: "checksum-mismatch",
    });
  });

  it("rejects a size mismatch", () => {
    expect(verifyDownloadedApk(input({ downloadedSize: 512 }))).toEqual({
      ok: false,
      reason: "size-mismatch",
    });
  });

  it("rejects the wrong package identity", () => {
    expect(
      verifyDownloadedApk(
        input({ inspection: validInspection({ packageName: "com.example.evil" }) }),
      ),
    ).toEqual({ ok: false, reason: "package-mismatch" });
    expect(ZOPTION_ANDROID_PACKAGE_ID).toBe("site.zoption.android");
  });

  it("rejects a version that does not match metadata or is not newer", () => {
    expect(
      verifyDownloadedApk(input({ inspection: validInspection({ versionCode: 20999 }) })),
    ).toEqual({ ok: false, reason: "version-mismatch" });
    expect(
      verifyDownloadedApk(
        input({
          expectedVersionCode: INSTALLED_VERSION_CODE,
          inspection: validInspection({ versionCode: INSTALLED_VERSION_CODE }),
        }),
      ),
    ).toEqual({ ok: false, reason: "downgrade" });
  });

  it("rejects the wrong signer, a missing signer, and multiple signers", () => {
    expect(
      verifyDownloadedApk(
        input({
          inspection: validInspection({
            signerSha256: [
              "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
            ],
          }),
        }),
      ),
    ).toEqual({ ok: false, reason: "signer-mismatch" });
    expect(
      verifyDownloadedApk(input({ inspection: validInspection({ signerSha256: [] }) })),
    ).toEqual({ ok: false, reason: "missing-signer" });
    expect(
      verifyDownloadedApk(
        input({
          inspection: validInspection({
            signerSha256: [
              ZOPTION_ANDROID_SIGNER_SHA256,
              ZOPTION_ANDROID_SIGNER_SHA256.replace("F9", "00"),
            ],
          }),
        }),
      ),
    ).toEqual({ ok: false, reason: "multiple-signers" });
  });

  it("rejects when metadata names the permanent signer but the APK does not", () => {
    expect(
      verifyDownloadedApk(
        input({
          expectedCertificateSha256: ZOPTION_ANDROID_SIGNER_SHA256,
          inspection: validInspection({
            signerSha256: [
              "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
            ],
          }),
        }),
      ),
    ).toEqual({ ok: false, reason: "signer-mismatch" });
  });

  it("rejects when the APK signer is trusted but the metadata fingerprint is not", () => {
    expect(
      verifyDownloadedApk(
        input({
          expectedCertificateSha256:
            "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
        }),
      ),
    ).toEqual({ ok: false, reason: "signer-mismatch" });
  });
});
