import { navigationMetrics } from "./navigation";

describe("platform navigation metrics", () => {
  it("preserves the iOS 44 point target and large-title convention", () => {
    expect(navigationMetrics("ios")).toEqual({
      minimumTouchTarget: 44,
      topLevelTitleMode: "large",
      supportsExpandedRail: false,
    });
  });

  it("preserves the Android 48 dp target and expanded rail capability", () => {
    expect(navigationMetrics("android")).toEqual({
      minimumTouchTarget: 48,
      topLevelTitleMode: "material",
      supportsExpandedRail: true,
    });
  });
});
