import {
  ANDROID_DOWNLOAD_HOST,
  ANDROID_LATEST_URL,
  ZOPTION_ANDROID_SIGNER_SHA256,
} from "./constants";
import {
  isTrustedZoptionSigner,
  normalizeCertificateSha256,
  parseRemoteAndroidRelease,
} from "./android-release-metadata";
import { VALID_APK_SHA256, validRemoteMetadata } from "./test-fixtures";

describe("Android latest.json metadata validation", () => {
  it("points at the canonical metadata endpoint", () => {
    expect(ANDROID_LATEST_URL).toBe("https://downloads.zoption.site/android/latest.json");
    expect(ANDROID_DOWNLOAD_HOST).toBe("downloads.zoption.site");
  });

  it("accepts valid metadata and normalizes checksums", () => {
    const release = parseRemoteAndroidRelease(validRemoteMetadata());
    expect(release).toMatchObject({
      versionName: "0.2.1-beta",
      versionCode: 20301,
      downloadUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.1.apk",
      sha256: VALID_APK_SHA256,
      certificateSha256: ZOPTION_ANDROID_SIGNER_SHA256,
      size: 1024,
      reinstallRequired: false,
    });
    expect(release?.notes).toEqual(["Receipt scan polish and in-app updates."]);
  });

  it("accepts a 64-hex certificate fingerprint", () => {
    const release = parseRemoteAndroidRelease(
      validRemoteMetadata({
        certificateSha256: ZOPTION_ANDROID_SIGNER_SHA256.replace(/:/g, "").toLowerCase(),
      }),
    );
    expect(release?.certificateSha256).toBe(ZOPTION_ANDROID_SIGNER_SHA256);
  });

  it("rejects malformed shapes", () => {
    expect(parseRemoteAndroidRelease(null)).toBeNull();
    expect(parseRemoteAndroidRelease([])).toBeNull();
    expect(parseRemoteAndroidRelease("not an object")).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ version: 42 }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ versionCode: "20301" }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ versionCode: 0 }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ versionCode: -3 }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ size: -1 }))).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ releasedAt: "next week" }))).toBeNull();
    expect(
      parseRemoteAndroidRelease(validRemoteMetadata({ reinstallRequired: undefined })),
    ).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ notes: ["ok", 7] }))).toBeNull();
  });

  it("rejects non-HTTPS download URLs", () => {
    expect(
      parseRemoteAndroidRelease(
        validRemoteMetadata({
          downloadUrl: "http://downloads.zoption.site/android/zoption-beta-0.2.1.apk",
        }),
      ),
    ).toBeNull();
    expect(
      parseRemoteAndroidRelease(validRemoteMetadata({ downloadUrl: "file:///tmp/fake.apk" })),
    ).toBeNull();
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ downloadUrl: "not a url" }))).toBeNull();
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
          validRemoteMetadata({ downloadUrl: `https://${host}/android/zoption-beta-0.2.1.apk` }),
        ),
      ).toBeNull();
    }
  });

  it("rejects download paths outside /android/*.apk", () => {
    expect(
      parseRemoteAndroidRelease(
        validRemoteMetadata({ downloadUrl: "https://downloads.zoption.site/android/latest.json" }),
      ),
    ).toBeNull();
    expect(
      parseRemoteAndroidRelease(
        validRemoteMetadata({
          downloadUrl: "https://downloads.zoption.site/zoption-beta-0.2.1.apk",
        }),
      ),
    ).toBeNull();
    expect(
      parseRemoteAndroidRelease(
        validRemoteMetadata({
          downloadUrl: "https://downloads.zoption.site/android/../secret/zoption-beta-0.2.1.apk",
        }),
      ),
    ).toBeNull();
  });

  it("rejects invalid APK SHA-256 checksums", () => {
    expect(parseRemoteAndroidRelease(validRemoteMetadata({ sha256: "abc" }))).toBeNull();
    expect(
      parseRemoteAndroidRelease(
        validRemoteMetadata({ sha256: `${VALID_APK_SHA256.slice(0, 63)}g` }),
      ),
    ).toBeNull();
  });

  it("rejects invalid certificate fingerprints", () => {
    expect(
      parseRemoteAndroidRelease(validRemoteMetadata({ certificateSha256: "GG:00" })),
    ).toBeNull();
    expect(
      parseRemoteAndroidRelease(validRemoteMetadata({ certificateSha256: "F9:46:70:EB:94:11" })),
    ).toBeNull();
    expect(isTrustedZoptionSigner(ZOPTION_ANDROID_SIGNER_SHA256.toLowerCase())).toBe(true);
    expect(normalizeCertificateSha256("GARBAGE")).toBeNull();
  });
});
