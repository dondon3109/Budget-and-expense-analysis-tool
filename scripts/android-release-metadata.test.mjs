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
    });
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
  it("renders the env contract consumed by android-play.yml", () => {
    expect(renderGitHubEnvLines(deriveAndroidReleaseMetadata(productionConfig))).toEqual([
      "RELEASE_VERSION_NAME=0.2.7-beta",
      "RELEASE_VERSION_CODE=20307",
      "ANDROID_PACKAGE=site.zoption.android",
    ]);
  });
});
