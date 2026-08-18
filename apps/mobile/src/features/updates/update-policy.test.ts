import { ZOPTION_ANDROID_SIGNER_SHA256 } from "./constants";
import { compareVersionCodes, decideUpdateAction } from "./update-policy";
import { installedApp, parsedRelease } from "./test-fixtures";

describe("Android update policy", () => {
  it("uses versionCode as the authoritative comparison", () => {
    expect(compareVersionCodes(20301, 20300)).toBe("available");
    expect(compareVersionCodes(20300, 20300)).toBe("current");
    expect(compareVersionCodes(20200, 20300)).toBe("downgrade");
  });

  it("offers a normal update when a newer permanent-key release is available", () => {
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp(),
        latest: parsedRelease(),
      }),
    ).toMatchObject({ status: "available", latest: { versionCode: 20301 } });
  });

  it("treats the same versionCode as current even if reinstallRequired is true", () => {
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp(),
        latest: parsedRelease({
          versionName: "0.2.0-beta",
          versionCode: 20300,
          reinstallRequired: true,
        }),
      }),
    ).toMatchObject({ status: "current" });
  });

  it("does not start the in-place updater when a newer release requires reinstall", () => {
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp(),
        latest: parsedRelease({ reinstallRequired: true }),
      }),
    ).toMatchObject({ status: "reinstallRequired" });
  });

  it("rejects older metadata as a downgrade", () => {
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp(),
        latest: parsedRelease({ versionCode: 20200 }),
      }),
    ).toEqual({ status: "downgrade" });
  });

  it("rejects metadata that is not signed with the permanent Zoption certificate", () => {
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp(),
        latest: parsedRelease({
          certificateSha256: ZOPTION_ANDROID_SIGNER_SHA256.replace("F9", "00"),
        }),
      }),
    ).toEqual({ status: "untrusted-signer" });
  });

  it("rejects missing metadata and non-production packages", () => {
    expect(
      decideUpdateAction({ platform: "android", installed: installedApp(), latest: null }),
    ).toEqual({ status: "invalid-metadata" });
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp({ packageName: "site.zoption.android.dev" }),
        latest: parsedRelease(),
      }),
    ).toEqual({ status: "unsupported", reason: "wrong-package" });
    expect(
      decideUpdateAction({
        platform: "android",
        installed: installedApp({ packageName: "site.zoption.android.preview" }),
        latest: parsedRelease(),
      }),
    ).toEqual({ status: "unsupported", reason: "wrong-package" });
    expect(
      decideUpdateAction({
        platform: "ios",
        installed: installedApp(),
        latest: parsedRelease(),
      }),
    ).toEqual({ status: "unsupported", reason: "wrong-platform" });
  });
});
