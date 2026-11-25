import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pins the native Google Play In-App Updates module configuration and safety guards.

const moduleRoot = resolve(__dirname, "../../../modules/zoption-play-updates");

function read(relativePath: string): string {
  return readFileSync(resolve(moduleRoot, relativePath), "utf8");
}

describe("Android Play updates module", () => {
  it("registers the Android Expo module and depends on Play app-update", () => {
    const config = JSON.parse(read("expo-module.config.json")) as {
      platforms: string[];
      android: { modules: string[] };
    };
    expect(config.platforms).toEqual(["android"]);
    expect(config.android.modules).toEqual(["site.zoption.playupdates.ZoptionPlayUpdatesModule"]);

    const gradle = read("android/build.gradle");
    expect(gradle).toContain("com.google.android.play:app-update:");
    expect(gradle).not.toContain("REQUEST_INSTALL_PACKAGES");
  });

  it("checks UpdateAvailability via AppUpdateManager and resolves unavailable safely on failure", () => {
    const moduleSource = read(
      "android/src/main/java/site/zoption/playupdates/ZoptionPlayUpdatesModule.kt",
    );
    expect(moduleSource).toContain('Name("ZoptionPlayUpdates")');
    expect(moduleSource).toContain("AppUpdateManagerFactory.create");
    expect(moduleSource).toContain("UpdateAvailability.UPDATE_AVAILABLE");
    expect(moduleSource).toContain("availableVersionCode");
    expect(moduleSource).toContain("addOnFailureListener");
    expect(moduleSource).not.toContain("REQUEST_INSTALL_PACKAGES");
  });
});
