import { describe, expect, it } from "vitest";

import { channelProblems } from "./android-channel-check.mjs";

const published = {
  version: "0.2.47-beta",
  versionCode: 20347,
  downloadUrl: "https://downloads.zoption.site/android/zoption-beta-0.2.47.apk",
  sha256: "a".repeat(64),
  certificateSha256:
    "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D",
  size: 139447033,
  releasedAt: "2026-10-06",
  minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
  reinstallRequired: false,
  notes: ["A change"],
};
const reachable = { ok: true, status: 200, contentLength: 139447033 };

describe("android channel check", () => {
  it("accepts a channel whose APK is reachable at the declared size", () => {
    expect(channelProblems(published, reachable)).toEqual([]);
  });

  it("reports metadata the app would reject", () => {
    expect(channelProblems({ ...published, versionCode: "20347" }, reachable)).toEqual([
      "android/latest.json is not valid release metadata.",
    ]);
  });

  it("reports a foreign signing certificate", () => {
    const foreign = { ...published, certificateSha256: "AA:".repeat(31) + "AA" };
    expect(channelProblems(foreign, reachable).join(" ")).toContain("permanent Zoption key");
  });

  it("reports a missing or truncated APK", () => {
    expect(channelProblems(published, { ok: false, status: 404, contentLength: NaN })).toEqual([
      "The APK answered HTTP 404.",
    ]);
    expect(channelProblems(published, { ...reachable, contentLength: 1000 })[0]).toContain(
      "declares 139447033",
    );
  });
});
