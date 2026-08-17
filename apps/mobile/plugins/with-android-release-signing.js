"use strict";

const { withAppBuildGradle } = require("@expo/config-plugins");

const MARKER = "zoption-release-signing";

const KEYSTORE_PREAMBLE = [
  `// ${MARKER}: release signing reads the gitignored apps/mobile/keystore.properties` ,
  "// for local builds, or the CI environment for GitHub Actions:",
  "// ANDROID_KEYSTORE_PATH (decoded from ANDROID_KEYSTORE_BASE64),",
  "// ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.",
  "def zoptionKeystorePropertiesFile = new File(rootProject.projectDir.parentFile, \"keystore.properties\")",
  "def zoptionKeystoreProperties = new Properties()",
  "def hasZoptionReleaseKeystoreProps = zoptionKeystorePropertiesFile.exists()",
  "if (hasZoptionReleaseKeystoreProps) {",
  "    zoptionKeystoreProperties.load(new FileInputStream(zoptionKeystorePropertiesFile))",
  "}",
].join("\n");

const RELEASE_SIGNING_BLOCK = [
  "        release {",
  `            // ${MARKER}: never falls back to the debug keystore.`,
  "            if (hasZoptionReleaseKeystoreProps) {",
  "                storeFile file(zoptionKeystoreProperties[\"storeFile\"])",
  "                storePassword zoptionKeystoreProperties[\"storePassword\"]",
  "                keyAlias zoptionKeystoreProperties[\"keyAlias\"]",
  "                keyPassword zoptionKeystoreProperties[\"keyPassword\"]",
  "            } else if (System.getenv(\"ANDROID_KEYSTORE_PATH\") != null) {",
  "                storeFile file(System.getenv(\"ANDROID_KEYSTORE_PATH\"))",
  "                storePassword System.getenv(\"ANDROID_KEYSTORE_PASSWORD\")",
  "                keyAlias System.getenv(\"ANDROID_KEY_ALIAS\")",
  "                keyPassword System.getenv(\"ANDROID_KEY_PASSWORD\")",
  "            }",
  "        }",
].join("\n");

const DEBUG_SIGNING_BLOCK = [
  "    signingConfigs {",
  "        debug {",
  "            storeFile file('debug.keystore')",
  "            storePassword 'android'",
  "            keyAlias 'androiddebugkey'",
  "            keyPassword 'android'",
  "        }",
  "    }",
].join("\n");

function transformBuildGradle(contents) {
  if (contents.includes(MARKER)) return contents;

  if (!contents.includes(DEBUG_SIGNING_BLOCK)) {
    throw new Error(
      `${MARKER}: could not find the default debug signingConfigs block in android/app/build.gradle; the Expo/React Native template may have changed.`,
    );
  }

  // Anchor on the LAST line of the block (the signingConfigs closing
  // brace). A plain substring replace of "    }" would match inside the
  // 8-space "        }" line and nest release inside the debug block.
  const signingBlockWithRelease = DEBUG_SIGNING_BLOCK.replace(
    /\n {4}}\s*$/,
    "\n" + RELEASE_SIGNING_BLOCK + "\n    }",
  );
  let next = contents.replace(DEBUG_SIGNING_BLOCK, signingBlockWithRelease);

  const releaseSigningLine =
    /(\brelease \{\n\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n\s*)(signingConfig signingConfigs\.)debug/;
  if (!releaseSigningLine.test(next)) {
    throw new Error(
      `${MARKER}: could not find the default release buildType signingConfig line in android/app/build.gradle; the Expo/React Native template may have changed.`,
    );
  }
  next = next.replace(releaseSigningLine, "$1$2release");

  const androidBlock = /^android \{\n/m;
  if (!androidBlock.test(next)) {
    throw new Error(
      `${MARKER}: could not find the top-level android block in android/app/build.gradle.`,
    );
  }
  return next.replace(androidBlock, KEYSTORE_PREAMBLE + "\nandroid {\n");
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = transformBuildGradle(modConfig.modResults.contents);
    return modConfig;
  });
};

module.exports.transformBuildGradle = transformBuildGradle;
