import type { PlatformOSType } from "react-native";

export interface NavigationMetrics {
  minimumTouchTarget: number;
  topLevelTitleMode: "large" | "material";
  supportsExpandedRail: boolean;
}

export function navigationMetrics(platform: PlatformOSType): NavigationMetrics {
  return platform === "ios"
    ? { minimumTouchTarget: 44, topLevelTitleMode: "large", supportsExpandedRail: false }
    : { minimumTouchTarget: 48, topLevelTitleMode: "material", supportsExpandedRail: true };
}
