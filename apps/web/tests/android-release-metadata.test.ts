import { describe, expect, it } from "vitest";

import {
  ANDROID_DOWNLOAD_HOST,
  ANDROID_LATEST_URL,
  formatSizeLabel,
  normalizeCertificateSha256,
  parseRemoteAndroidRelease,
} from "../src/releases/androidReleaseMetadata";

const PERMANENT_CERT_COLON =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";
const APK_SHA256 = "2e68b78cda241796023e039069865e164a9839c15036c696308ca9b61f28cc67";

function validRemote(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.0",
    versionCode: 20202,
    downloadUrl: "https://downloads.zoption.site/zoption-beta-0.2.0.apk",
    sha256: APK_SHA256,
    certificateSha256: PERMANENT_CERT_COLON,
    size: 66067723,
    releasedAt: "2026-08-18",
    minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
    reinstallRequired: true,
    notes: ["Reinstall required: new signing key."],
    ...overrides,
  };
}

describe("R2 android/latest.json metadata validation", () => {
  it("points at the canonical R2 metadata object", () => {
    expect(ANDROID_LATEST_URL).toBe("https://downloads.zoption.site/android/latest.json");
  });

  it("accepts valid metadata and normalizes it for the install page", () => {
    const release = parseRemoteAndroidRelease(validRemote());
    expect(release).not.toBeNull();
    expect(release).toMatchObject({
      packageId: "site.zoption.android",
      versionName: "0.2.0",
      versionCode: 20202,
      filename: "zoption-beta-0.2.0.apk",
      downloadPath: "https://downloads.zoption.site/zoption-beta-0.2.0.apk",
      sha256: APK_SHA256.toLowerCase(),
      certificateSha256: PERMANENT_CERT_COLON,
      sizeBytes: 66067723,
      releaseDate: "2026-08-18",
      minimumAndroid: "Android 7.0 or newer (API 24+)",
      reinstallRequired: true,
    });
    expect(release?.notes).toEqual(["Reinstall required: new signing key."]);
    expect(release?.sizeLabel).toContain("66,067,723 bytes");
    expect(release?.releaseDateLabel).toBe("August 18, 2026");
  });

  it("accepts a 64-hex certificate fingerprint and converts it to colon form", () => {
    const release = parseRemoteAndroidRelease(
      validRemote({ certificateSha256: PERMANENT_CERT_COLON.replace(/:/g, "").toLowerCase() }),
    );
    expect(release?.certificateSha256).toBe(PERMANENT_CERT_COLON);
  });

  it("defaults minimumAndroidVersion when omitted", () => {
    const release = parseRemoteAndroidRelease(
      validRemote({ minimumAndroidVersion: undefined }),
    );
    expect(release?.minimumAndroid).toBe("Android 7.0 or newer (API 24+)");
  });

  it("rejects malformed shapes", () => {
    expect(parseRemoteAndroidRelease(null)).toBeNull();
    expect(parseRemoteAndroidRelease([])).toBeNull();
    expect(parseRemoteAndroidRelease("not an object")).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ version: 42 }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ versionCode: "20202" }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ size: -1 }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ releasedAt: "next week" }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ reinstallRequired: undefined }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ reinstallRequired: "yes" }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ notes: ["ok", 7] }))).toBeNull();
  });

  it("rejects non-HTTPS download URLs", () => {
    expect(
      parseRemoteAndroidRelease(
        validRemote({ downloadUrl: "http://downloads.zoption.site/zoption-beta-0.2.0.apk" }),
      ),
    ).toBeNull();
    expect(
      parseRemoteAndroidRelease(validRemote({ downloadUrl: "file:///tmp/fake.apk" })),
    ).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ downloadUrl: "not a url" }))).toBeNull();
  });

  it("rejects download hosts other than downloads.zoption.site", () => {
    for (const host of [
      "zoption.site",
      "www.zoption.site",
      "downloads.zoption.site.evil.example",
      "github.com",
      "downloads-zoption-site.example",
    ]) {
      expect(
        parseRemoteAndroidRelease(
          validRemote({ downloadUrl: `https://${host}/zoption-beta-0.2.0.apk` }),
        ),
      ).toBeNull();
    }
    expect(ANDROID_DOWNLOAD_HOST).toBe("downloads.zoption.site");
  });

  it("rejects invalid APK SHA-256 checksums", () => {
    expect(parseRemoteAndroidRelease(validRemote({ sha256: "abc" }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ sha256: `${APK_SHA256.slice(0, 63)}g` }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ sha256: `${APK_SHA256} ` }))).toBeNull();
  });

  it("rejects invalid certificate fingerprints", () => {
    expect(parseRemoteAndroidRelease(validRemote({ certificateSha256: "GG:00" }))).toBeNull();
    expect(
      parseRemoteAndroidRelease(validRemote({ certificateSha256: "F9:46:70:EB:94:11" })),
    ).toBeNull();
    expect(parseRemoteAndroidRelease(validRemote({ certificateSha256: 7 }))).toBeNull();
  });

  it("rejects download paths that are not APK files", () => {
    expect(
      parseRemoteAndroidRelease(
        validRemote({ downloadUrl: "https://downloads.zoption.site/android/latest.json" }),
      ),
    ).toBeNull();
  });

  it("formats certificate fingerprints and sizes deterministically", () => {
    expect(normalizeCertificateSha256("GARBAGE")).toBeNull();
    expect(normalizeCertificateSha256(PERMANENT_CERT_COLON.toLowerCase())).toBe(
      PERMANENT_CERT_COLON,
    );
    expect(formatSizeLabel(139005705)).toBe("139,005,705 bytes (132.57 MiB)");
  });
});
