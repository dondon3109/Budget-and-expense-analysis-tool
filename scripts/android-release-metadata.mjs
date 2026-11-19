/**
 * Single resolver for the Android signed-release identity.
 *
 * A release bump edits exactly two files: apps/mobile/package.json for the
 * release version name and apps/mobile/app.config.ts for the Android
 * versionCode. This script reads both back out of the resolved Expo
 * configuration instead of letting the release workflow repeat the literals.
 * The verify steps in android-play.yml consume the GITHUB_ENV lines produced
 * here, so a bump never requires touching the workflow or tests.
 *
 * Usage (CI):
 *   pnpm --filter @zoption/mobile exec expo config --type introspect --json \
 *     | node scripts/android-release-metadata.mjs >> "$GITHUB_ENV"
 */

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Derives the verified-release identity from an Expo introspect config.
 * Kept pure so the release rules stay unit-testable without running Expo.
 */
export function deriveAndroidReleaseMetadata(config) {
  const version = config?.version;
  const versionCode = config?.android?.versionCode;
  const packageName = config?.android?.package;

  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(
      `Expo config must provide a valid semver version string; got: ${JSON.stringify(version)}`,
    );
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(
      `Expo config must provide a positive integer android.versionCode; got: ${JSON.stringify(versionCode)}`,
    );
  }
  if (typeof packageName !== "string" || !PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new Error(
      `Expo config must provide a valid android.package identifier; got: ${JSON.stringify(packageName)}`,
    );
  }

  return Object.freeze({ versionName: version, versionCode, packageName });
}

/** Renders the identity as GITHUB_ENV lines consumed by android-play.yml. */
export function renderGitHubEnvLines(metadata) {
  return [
    `RELEASE_VERSION_NAME=${metadata.versionName}`,
    `RELEASE_VERSION_CODE=${metadata.versionCode}`,
    `ANDROID_PACKAGE=${metadata.packageName}`,
  ];
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(chunks.join(""));
}

async function main() {
  let config;
  try {
    config = await readStdinJson();
  } catch (error) {
    throw new Error(`Could not parse the Expo introspect JSON from stdin: ${error.message}`, {
      cause: error,
    });
  }
  const metadata = deriveAndroidReleaseMetadata(config);
  for (const line of renderGitHubEnvLines(metadata)) console.log(line);
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
