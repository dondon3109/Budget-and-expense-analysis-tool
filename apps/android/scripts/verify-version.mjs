import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const androidRoot = resolve(import.meta.dirname, "..");
const [androidPackage, twaManifest, gradleSource] = await Promise.all([
  readFile(resolve(androidRoot, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(androidRoot, "twa-manifest.json"), "utf8").then(JSON.parse),
  readFile(resolve(androidRoot, "app/build.gradle"), "utf8"),
]);

const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(androidPackage.version);
if (!versionMatch) {
  throw new Error(`Android version must use major.minor.patch: ${androidPackage.version}`);
}

const [, majorText, minorText, patchText] = versionMatch;
const major = Number(majorText);
const minor = Number(minorText);
const patch = Number(patchText);

if (minor > 99 || patch > 99) {
  throw new Error("Android version mapping supports minor and patch values from 0 through 99.");
}

const expectedCode = major * 10_000 + minor * 100 + patch;
const expectedVersion = androidPackage.version;

const assertions = [
  [twaManifest.appVersionName === expectedVersion, "twa-manifest appVersionName"],
  [twaManifest.appVersion === expectedVersion, "twa-manifest appVersion"],
  [twaManifest.appVersionCode === expectedCode, "twa-manifest appVersionCode"],
  [gradleSource.includes(`versionName "${expectedVersion}"`), "Gradle versionName"],
  [gradleSource.includes(`versionCode ${expectedCode}`), "Gradle versionCode"],
];

for (const [condition, label] of assertions) {
  if (!condition)
    throw new Error(`${label} is not synchronized with Android version ${expectedVersion}.`);
}

console.log(`Android version ${expectedVersion} maps deterministically to code ${expectedCode}.`);
