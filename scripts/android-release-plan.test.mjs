import { describe, expect, it } from "vitest";

import { decideAndroidRelease } from "./android-release-plan.mjs";

const ready = {
  versionName: "0.2.47-beta",
  versionCode: 20347,
  liveVersionCode: 20346,
  contractExists: true,
  checks: "full",
  mainIsCurrent: true,
  activeReleaseRuns: 0,
  productionVersion: "3.6.0",
  releaseTagVersion: "3.6.0",
};

describe("android release plan", () => {
  it("releases a newer version when production is settled on the latest release", () => {
    expect(decideAndroidRelease(ready).action).toBe("release");
  });

  it("does nothing for a version that is already published", () => {
    expect(decideAndroidRelease({ ...ready, versionCode: 20346 }).action).toBe("skip");
    expect(decideAndroidRelease({ ...ready, versionCode: 20300 }).action).toBe("skip");
  });

  it("stops a release that has no frozen sync contract", () => {
    expect(decideAndroidRelease({ ...ready, contractExists: false })).toMatchObject({
      action: "blocked",
      reason: expect.stringContaining("freeze-mobile-sync-contract"),
    });
  });

  it("leaves the decision to the newer commit or the running web release", () => {
    expect(decideAndroidRelease({ ...ready, mainIsCurrent: false }).action).toBe("skip");
    expect(decideAndroidRelease({ ...ready, activeReleaseRuns: 1 }).action).toBe("skip");
  });

  it("blocks when production serves a different release than the latest tag", () => {
    expect(decideAndroidRelease({ ...ready, productionVersion: "3.5.0" })).toMatchObject({
      action: "blocked",
      reason: expect.stringContaining("v3.5.0"),
    });
  });

  it("checks only the identity for a manual dispatch", () => {
    const dispatched = {
      ...ready,
      checks: "identity",
      mainIsCurrent: undefined,
      activeReleaseRuns: undefined,
      productionVersion: undefined,
    };
    expect(decideAndroidRelease(dispatched).action).toBe("release");
    expect(decideAndroidRelease({ ...dispatched, contractExists: false }).action).toBe("blocked");
  });
});
