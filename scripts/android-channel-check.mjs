// Read-only check of the public Android Beta channel: android/latest.json must parse with the
// production metadata parser, name the permanent Zoption signing certificate, and point at an APK
// that is reachable with the size it declares. The Production Monitor runs it every 10 minutes; it
// does not download the APK (139 MB), because the publish job already verified its hash and
// signature before latest.json moved.
//
//   node --experimental-strip-types scripts/android-channel-check.mjs
import { pathToFileURL } from "node:url";

import {
  ANDROID_DOWNLOAD_HOST,
  ANDROID_LATEST_URL,
  parseRemoteAndroidRelease,
} from "../packages/web-common/src/releases/androidReleaseMetadata.ts";

// The permanent Zoption signing certificate; also pinned in android-beta.yml and the updater.
const REQUIRED_CERTIFICATE_SHA256 =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";

/** Problems with the published channel, or an empty list. `apk` is the APK's HEAD result. */
export function channelProblems(raw, apk) {
  const release = parseRemoteAndroidRelease(raw);
  if (!release) return ["android/latest.json is not valid release metadata."];
  const problems = [];
  if (release.certificateSha256 !== REQUIRED_CERTIFICATE_SHA256) {
    problems.push("latest.json names a signing certificate other than the permanent Zoption key.");
  }
  if (new URL(release.downloadPath).host !== ANDROID_DOWNLOAD_HOST) {
    problems.push(`latest.json downloads from ${new URL(release.downloadPath).host}.`);
  }
  if (!apk.ok) problems.push(`The APK answered HTTP ${apk.status}.`);
  else if (apk.contentLength !== release.sizeBytes) {
    problems.push(
      `The APK is ${apk.contentLength} bytes; latest.json declares ${release.sizeBytes}.`,
    );
  }
  return problems;
}

async function main() {
  const response = await fetch(ANDROID_LATEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`latest.json answered HTTP ${response.status}.`);
  const raw = await response.json();
  const release = parseRemoteAndroidRelease(raw);
  const head = release ? await fetch(release.downloadPath, { method: "HEAD" }) : undefined;
  const problems = channelProblems(raw, {
    ok: head?.ok ?? false,
    status: head?.status ?? 0,
    contentLength: Number(head?.headers.get("content-length")),
  });
  if (problems.length > 0) throw new Error(problems.join(" "));
  console.log(`Android Beta channel is healthy at ${release.versionName}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
