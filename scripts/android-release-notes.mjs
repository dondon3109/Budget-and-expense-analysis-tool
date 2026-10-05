// Derives the Android Beta's user-facing notes (the bullets in android/latest.json) from the
// in-app patch notes the release PR already writes, so they are written once.
//
//   node --experimental-strip-types scripts/android-release-notes.mjs   (one bullet per line)
import { pathToFileURL } from "node:url";

const MAX_NOTES = 6;

/** Change titles worth a bullet: the headline changes, not the fixes roll-up or the APK's own entry. */
export function releaseNotesFromChanges(changes) {
  return changes
    .map((change) => change.title.trim())
    .filter((title) => title && title !== "Fixes" && !/^Android Beta\b/.test(title))
    .slice(0, MAX_NOTES);
}

async function main() {
  // currentRelease.ts reads a build-time global; the version is irrelevant here.
  globalThis.__APP_VERSION__ = "0.0.0";
  const { currentRelease } = await import("../packages/web-common/src/releases/currentRelease.ts");
  for (const note of releaseNotesFromChanges(currentRelease.changes)) console.log(note);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
