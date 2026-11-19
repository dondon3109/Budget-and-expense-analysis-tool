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
          extra: { appVariant: "production" },
        },
        "android",
      ),
    ).toEqual({ version: "0.2.64-beta", build: "20364", source: "Google Play" });
  });

  it("names any other Android variant a test build", () => {
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
    ).toEqual({ version: "0.2.64-beta", build: "20364", source: "Android test build" });
  });

  it("reports unknown values instead of guessing", () => {
    expect(appVersionInfo(null, "ios")).toEqual({ version: null, build: null, source: "iOS" });
  });
});
