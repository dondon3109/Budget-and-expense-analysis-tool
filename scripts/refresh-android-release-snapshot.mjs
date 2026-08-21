/**
 * Refreshes the website's offline fallback snapshot
 * (apps/web/src/releases/androidRelease.json) from the live public
 * android/latest.json metadata.
 *
 * The fallback exists for the window when R2 cannot be reached, so it must
 * describe exactly the artifact the live channel advertises - never an older
 * release. The remote payload is untrusted: it goes through
 * parseRemoteAndroidRelease (the same strict parser the install page uses)
 * and must carry the permanent Zoption signing certificate before it may
 * become the trusted fallback.
 *
 * Usage:
 *   node scripts/refresh-android-release-snapshot.mjs                # dry-run to stdout
 *   node scripts/refresh-android-release-snapshot.mjs --write        # update the file
 *   node scripts/refresh-android-release-snapshot.mjs --allow-downgrade [--write]
 *
 * The Production Release workflow runs this with --write on main and commits
 * the result as a non-releasing [skip ci] chore commit; that small job is the
 * only place besides semantic-release granted contents: write. A live
 * versionCode below the committed snapshot is rejected unless
 * --allow-downgrade is passed explicitly, so a stale or rolled-back R2
 * channel can never silently regress the website's advertised release.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseRemoteAndroidRelease } from "../apps/web/src/releases/androidReleaseMetadata.ts";

// The permanent Zoption signing certificate. A fallback signed by anything
// else must never become trusted install metadata.
const REQUIRED_CERTIFICATE_SHA256 =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";

const DEFAULT_TARGET = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/src/releases/androidRelease.json",
);

/**
 * Builds the snapshot object from already-validated remote metadata. Kept
 * pure and separated from fetching so the formatting rules stay testable.
 * targetApi is not part of latest.json; it is carried over from the previous
 * snapshot because it only changes with an Expo SDK bump.
 */
export function buildSnapshotFromRemote(remote, { previous, allowDowngrade = false } = {}) {
  const parsed = parseRemoteAndroidRelease(remote);
  if (!parsed) {
    throw new Error("Live android/latest.json failed strict release-metadata validation.");
  }
  if (parsed.certificateSha256 !== REQUIRED_CERTIFICATE_SHA256) {
    throw new Error(
      "Live metadata is not signed by the permanent Zoption certificate; refusing to refresh.",
    );
  }

  // Downgrade protection: the committed fallback is the website's trusted
  // floor. A lower live versionCode means a stale or rolled-back channel and
  // must never silently become the advertised release; an intentional
  // rollback has to opt in explicitly.
  const previousVersionCode = previous?.versionCode;
  if (
    !allowDowngrade &&
    typeof previousVersionCode === "number" &&
    parsed.versionCode < previousVersionCode
  ) {
    throw new Error(
      `Live channel advertises versionCode ${parsed.versionCode}, below the committed snapshot's ${previousVersionCode}. Refusing to publish a fallback downgrade; rerun with --allow-downgrade only for an intentional rollback.`,
    );
  }

  const previousTargetApi = previous?.targetApi;
  const snapshot = {
    packageId: parsed.packageId,
    versionName: parsed.versionName,
    versionCode: parsed.versionCode,
    filename: parsed.filename,
    downloadPath: parsed.downloadPath,
    sha256: parsed.sha256,
    sizeBytes: parsed.sizeBytes,
    sizeLabel: parsed.sizeLabel,
    releaseDate: parsed.releaseDate,
    releaseDateLabel: parsed.releaseDateLabel,
    minimumAndroid: parsed.minimumAndroid,
  };
  if (typeof previousTargetApi === "number") {
    snapshot.targetApi = previousTargetApi;
  }
  snapshot.certificateSha256 = parsed.certificateSha256;
  snapshot.reinstallRequired = parsed.reinstallRequired;
  if (parsed.notes) {
    snapshot.notes = [...parsed.notes];
  }
  return snapshot;
}

async function readPreviousSnapshot(targetPath) {
  try {
    return JSON.parse(await readFile(targetPath, "utf8"));
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const args = {
    write: false,
    allowDowngrade: false,
    latestUrl: undefined,
    target: DEFAULT_TARGET,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--write") args.write = true;
    else if (value === "--allow-downgrade") args.allowDowngrade = true;
    else if (value === "--latest-url") args.latestUrl = argv[(index += 1)];
    else if (value === "--target") args.target = resolve(argv[(index += 1)]);
    else throw new Error("Unknown argument: " + String(value));
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const latestUrl = args.latestUrl ?? "https://downloads.zoption.site/android/latest.json";

  const response = await fetch(latestUrl);
  if (!response.ok) {
    throw new Error("Fetching " + latestUrl + " failed with HTTP " + response.status + ".");
  }
  let remote;
  try {
    remote = await response.json();
  } catch (error) {
    throw new Error("Live android/latest.json is not valid JSON: " + error.message, {
      cause: error,
    });
  }

  const previous = await readPreviousSnapshot(args.target);
  const snapshot = buildSnapshotFromRemote(remote, {
    previous,
    allowDowngrade: args.allowDowngrade,
  });
  const serialized = JSON.stringify(snapshot, null, 2) + "\n";

  if (!args.write) {
    process.stdout.write(serialized);
    return;
  }

  await writeFile(args.target, serialized, "utf8");
  const direction =
    previous &&
    typeof previous.versionCode === "number" &&
    previous.versionCode !== snapshot.versionCode
      ? " (" + previous.versionCode + " -> " + snapshot.versionCode + ")"
      : "";
  console.log(
    "Refreshed " +
      args.target +
      " to " +
      snapshot.versionName +
      " / versionCode " +
      snapshot.versionCode +
      direction,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
