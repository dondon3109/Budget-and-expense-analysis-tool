"use strict";

const { transformBuildGradle } = require("./with-android-release-signing");

const FIXTURE = `apply plugin: "com.android.application"

android {
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        applicationId "site.zoption.android"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

test("keeps debug signing and points release at the release signing config", () => {
  const out = transformBuildGradle(FIXTURE);
  expect(out).toContain("zoption-release-signing");
  // debug signing config is preserved
  expect(out).toContain("storePassword 'android'");
  // structure: debug closes BEFORE the release block starts (regression for
  // the bug where release got nested inside the debug block)
  expect(out).toContain("keyPassword 'android'\n        }\n        release {");
  // release build type signs with the release config, not the debug one
  expect(out).toMatch(/release \{[\s\S]*?signingConfig signingConfigs\.release/);
  expect(out).toContain("debug {\n            signingConfig signingConfigs.debug");
  // credentials come from keystore.properties or the CI env vars
  expect(out).toContain("zoptionKeystoreProperties[\"storeFile\"]");
  expect(out).toContain("System.getenv(\"ANDROID_KEYSTORE_PATH\")");
  expect(out).toContain("System.getenv(\"ANDROID_KEYSTORE_PASSWORD\")");
  expect(out).toContain("System.getenv(\"ANDROID_KEY_ALIAS\")");
  expect(out).toContain("System.getenv(\"ANDROID_KEY_PASSWORD\")");
  // the preamble must precede the android block
  expect(out.indexOf("zoptionKeystorePropertiesFile")).toBeLessThan(out.indexOf("android {"));
});

test("is idempotent", () => {
  const once = transformBuildGradle(FIXTURE);
  expect(transformBuildGradle(once)).toBe(once);
});

test("fails loudly when the template anchors disappear", () => {
  const broken = FIXTURE.replace("signingConfigs {\n        debug {", "signingConfigs {\n        renamed {");
  expect(() => transformBuildGradle(broken)).toThrow(/template may have changed/);
  const brokenRelease = FIXTURE.replace(
    "// Caution! In production, you need to generate your own keystore file.",
    "// changed comment",
  );
  expect(() => transformBuildGradle(brokenRelease)).toThrow(/template may have changed/);
});
