// Decides whether the Android Beta pipeline owes a release for a commit, and writes the answer to
// GITHUB_OUTPUT. The workflow runs it after every Production Release on main, so an ordinary web
// release finds nothing to do and a merged version bump starts the pipeline by itself.
//
//   release   the version is newer than the published one and nothing blocks it
//   skip      nothing to do now (already published, main moved on, or another release is active)
//   blocked   a release is owed but must not ship yet; the workflow fails so a human looks
//
// Env: RELEASE_VERSION_NAME, RELEASE_VERSION_CODE (from android-release-metadata.mjs), and for the
// full checks RELEASE_COMMIT, TRIGGER_RUN_ID, GH_TOKEN, GITHUB_REPOSITORY. CHECKS=identity limits
// it to the version and contract checks, which is what a manual dispatch needs.
import { execFile } from "node:child_process";
import { access, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const ACTIVE_RUN_STATUSES = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);

/** Pure decision over the facts the CLI gathers; `checks: "identity"` skips the pipeline-state ones. */
export function decideAndroidRelease(facts) {
  const { versionName, versionCode, liveVersionCode, contractExists } = facts;
  if (versionCode <= liveVersionCode) {
    return {
      action: "skip",
      reason: `${versionName} (${versionCode}) is not newer than the published build (${liveVersionCode}).`,
    };
  }
  if (!contractExists) {
    return {
      action: "blocked",
      reason: `No frozen sync contract for ${versionName}. Run node scripts/freeze-mobile-sync-contract.mjs ${versionName}.`,
    };
  }
  if (facts.checks === "identity") return { action: "release", reason: `${versionName} is new.` };
  if (!facts.mainIsCurrent) {
    return { action: "skip", reason: "main has moved on; the newer commit decides." };
  }
  if (facts.activeReleaseRuns > 0) {
    return {
      action: "skip",
      reason: "Another Production Release is still running or waiting; its completion decides.",
    };
  }
  if (facts.productionVersion !== facts.releaseTagVersion) {
    return {
      action: "blocked",
      reason: `Production serves v${facts.productionVersion} but the latest release is v${facts.releaseTagVersion}; the APK would talk to a different API than it was built for.`,
    };
  }
  return {
    action: "release",
    reason: `${versionName} is new and production is on v${facts.productionVersion}.`,
  };
}

async function json(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function gather() {
  const versionName = process.env.RELEASE_VERSION_NAME;
  const versionCode = Number(process.env.RELEASE_VERSION_CODE);
  if (!versionName || !Number.isInteger(versionCode)) {
    throw new Error("RELEASE_VERSION_NAME and RELEASE_VERSION_CODE are required.");
  }
  const live = await json("https://downloads.zoption.site/android/latest.json");
  if (!Number.isInteger(live.versionCode))
    throw new Error("Published latest.json has no versionCode.");
  const contractExists = await access(
    resolve(root, `packages/shared/contracts/mobile-sync/${versionName}.json`),
  ).then(
    () => true,
    () => false,
  );
  const facts = {
    versionName,
    versionCode,
    liveVersionCode: live.versionCode,
    contractExists,
    checks: process.env.CHECKS === "identity" ? "identity" : "full",
  };
  if (facts.checks === "identity") return facts;

  const commit = process.env.RELEASE_COMMIT;
  const { stdout: remote } = await run("git", ["ls-remote", "origin", "refs/heads/main"], {
    cwd: root,
  });
  const { stdout: tag } = await run(
    "git",
    ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", commit],
    { cwd: root },
  );
  const { stdout: runs } = await run("gh", [
    "run",
    "list",
    "--workflow",
    "release.yml",
    "--limit",
    "20",
    "--json",
    "databaseId,status",
  ]);
  const triggerRun = Number(process.env.TRIGGER_RUN_ID);
  return {
    ...facts,
    mainIsCurrent: remote.split("\t")[0] === commit,
    releaseTagVersion: tag.trim().replace(/^v/, ""),
    productionVersion: (await json("https://app.zoption.site/release.json")).appVersion,
    activeReleaseRuns: JSON.parse(runs).filter(
      (item) => ACTIVE_RUN_STATUSES.has(item.status) && item.databaseId !== triggerRun,
    ).length,
  };
}

async function main() {
  const decision = decideAndroidRelease(await gather());
  console.log(`${decision.action}: ${decision.reason}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `action=${decision.action}\nreason=${decision.reason.replaceAll("\n", " ")}\n`,
    );
  }
  if (decision.action === "blocked") process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
