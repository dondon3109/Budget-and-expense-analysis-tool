import { appVersionInfo } from "./app-version";

describe("appVersionInfo", () => {
  it("names the Google Play build with its version code", () => {
    expect(
      appVersionInfo(
        {
          name: "Zoption",
          slug: "zoption",
          version: "0.2.64-beta",
          android: { versionCode: 20364 },
          extra: { distribution: "play" },
        },
        "android",
      ),
    ).toEqual({ version: "0.2.64-beta", build: "20364", source: "Google Play" });
  });

  it("treats Android without play metadata as the sideloaded APK", () => {
    expect(
      appVersionInfo(
        {
          name: "Zoption",
          slug: "zoption",
          version: "0.2.64-beta",
          android: { versionCode: 20364 },
        },
        "android",
      ),
    ).toEqual({ version: "0.2.64-beta", build: "20364", source: "Android Beta APK" });
  });

  it("reports unknown values instead of guessing", () => {
    expect(appVersionInfo(null, "ios")).toEqual({ version: null, build: null, source: "iOS" });
  });
});
