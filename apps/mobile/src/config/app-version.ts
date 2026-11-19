import Constants from "expo-constants";
import { Platform } from "react-native";

import { isPlayDistribution } from "@/config/app-variant";

export interface AppVersionInfo {
  /** `version` from apps/mobile/package.json, such as `0.2.63-beta`. */
  version: string | null;
  /** Android `versionCode` or iOS `buildNumber` embedded at build time. */
  build: string | null;
  /** Where this copy came from, so a tester can tell the Play and sideloaded builds apart. */
  source: string;
}

/** The version this build embeds; missing metadata reads as unknown rather than guessed. */
export function appVersionInfo(config = Constants.expoConfig, os = Platform.OS): AppVersionInfo {
  const version = config?.version ?? null;
  if (os === "android") {
    const code = config?.android?.versionCode;
    return {
      version,
      build: code === undefined ? null : String(code),
      source: isPlayDistribution(config?.extra) ? "Google Play" : "Android Beta APK",
    };
  }
  if (os === "ios") {
    return { version, build: config?.ios?.buildNumber ?? null, source: "iOS" };
  }
  return { version, build: null, source: os };
}
