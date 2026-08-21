import { describe, expect, it } from "vitest";

import { deriveAndroidReleaseMetadata, renderGitHubEnvLines } from "./android-release-metadata.mjs";

const productionConfig = {
  version: "0.2.7-beta",
  android: { package: "site.zoption.android", versionCode: 20307 },
};

describe("deriveAndroidReleaseMetadata", () => {
  it("derives the verified release identity from the Expo introspect config", () => {
    expect(deriveAndroidReleaseMetadata(productionConfig)).toEqual({
      versionName: "0.2.7-beta",
      versionCode: 20307,
      packageName: "site.zoption.android",
      apkObjectKey: "android/zoption-beta-0.2.7.apk",
      publicApkUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.7.apk",
    });
  });

  it("keeps prerelease labels out of the R2 object key", () => {
    const metadata = deriveAndroidReleaseMetadata({
      version: "1.2.3-rc.1",
      android: { package: "site.zoption.android", versionCode: 11203 },
    });
    expect(metadata.apkObjectKey).toBe("android/zoption-beta-1.2.3.apk");
    expect(metadata.versionName).toBe("1.2.3-rc.1");
  });

  it("rejects configs without a usable Android release identity", () => {
    expect(() => deriveAndroidReleaseMetadata(undefined)).toThrow(/version/);
    expect(() => deriveAndroidReleaseMetadata({ version: "not-semver", android: {} })).toThrow(
      /version/,
    );
    expect(() =>
      deriveAndroidReleaseMetadata({ version: "0.2.8-beta", android: { versionCode: 0 } }),
    ).toThrow(/versionCode/);
    expect(() =>
      deriveAndroidReleaseMetadata({
        version: "0.2.8-beta",
        android: { versionCode: 20308, package: "not an identifier" },
      }),
    ).toThrow(/android\.package/);
  });
});

describe("renderGitHubEnvLines", () => {
  it("renders the env contract consumed by android-beta.yml", () => {
    expect(renderGitHubEnvLines(deriveAndroidReleaseMetadata(productionConfig))).toEqual([
      "RELEASE_VERSION_NAME=0.2.7-beta",
      "RELEASE_VERSION_CODE=20307",
      "ANDROID_PACKAGE=site.zoption.android",
      "APK_OBJECT_KEY=android/zoption-beta-0.2.7.apk",
      "APK_PUBLIC_URL=https://downloads.zoption.site/android/zoption-beta-0.2.7.apk",
    ]);
  });
});
