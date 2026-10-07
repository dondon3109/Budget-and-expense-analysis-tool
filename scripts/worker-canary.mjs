// The production Worker's gradual rollout, run by the Production Release workflow between
// `wrangler versions upload` and the final `wrangler versions deploy <new>@100`.
//
//   plan   Reads the live deployment and decides the strategy. A change to Durable Object
//          migrations or queue consumers since the last release cannot ride a gradual rollout
//          (Cloudflare applies both only on `wrangler deploy`), so those go out atomically.
//          Also proves the token can read Workers analytics before anything is deployed.
//   probe  Sends version-pinned requests (Cloudflare-Workers-Version-Overrides) to the new
//          version while it serves 0% of traffic, and checks /health reports that version.
//   soak   Holds the canary percentage for the dwell time, probing every 30 seconds, then
//          compares the new version's invocation error rate with the old one's over the same
//          window. Analytics that cannot be read fail the soak, which rolls the release back.
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, API_URL, APP_URL, and for probe/soak
// NEW_VERSION. Soak also reads CANARY_DWELL_MINUTES (default 10), CANARY_MAX_EXTRA_ERROR_POINTS
// (percentage points the new version may exceed the old one by, default 1) and
// CANARY_MIN_REQUESTS (requests to the new version needed to judge, default 50); an unset or
// empty value takes the default. Outputs go to GITHUB_OUTPUT, notes to GITHUB_STEP_SUMMARY.
import { execFile } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { parseJsonc } from "./validate-deployment-config.mjs";

const run = promisify(execFile);
const apiDirectory = resolve(import.meta.dirname, "../apps/api");
const configFile = "apps/api/wrangler.deploy.jsonc";

const DEFAULTS = { dwellMinutes: 10, maxExtraErrorPoints: 1, minRequests: 50 };

/** A non-negative number from the environment, or the default when the value is unset or empty. */
export function numberFromEnv(name, fallback, env = process.env) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}".`);
  }
  return value;
}

/** The settings a gradual rollout cannot change, for comparison across releases. */
export function atomicSettings(config) {
  const production = config?.env?.production ?? {};
  return JSON.stringify({
    migrations: production.migrations ?? config?.migrations ?? [],
    consumers: production.queues?.consumers ?? [],
  });
}

/** The single version serving all traffic, or an error when a rollout is already in flight. */
export function servingVersion(status) {
  const versions = status?.versions ?? [];
  if (versions.length !== 1 || versions[0].percentage !== 100) {
    throw new Error(
      `Production is split across ${versions.length} versions; finish or revert that rollout first.`,
    );
  }
  return versions[0].version_id;
}

export function overrideHeader(workerName, versionId) {
  return { "Cloudflare-Workers-Version-Overrides": `${workerName}="${versionId}"` };
}

/**
 * Pass/fail for the soak window from analytics rows grouped by scriptVersion. Below minRequests
 * on the new version the error rate is noise, so the probes decide alone and lowSample says so.
 */
export function judgeSoak(rows, newVersion, { maxExtraErrorPoints, minRequests } = DEFAULTS) {
  const totals = { new: { requests: 0, errors: 0 }, old: { requests: 0, errors: 0 } };
  for (const row of rows) {
    const side = row.dimensions.scriptVersion === newVersion ? totals.new : totals.old;
    side.requests += row.sum.requests;
    side.errors += row.sum.errors;
  }
  const rate = ({ requests, errors }) => (requests === 0 ? 0 : errors / requests);
  const summary = `new ${totals.new.errors}/${totals.new.requests}, old ${totals.old.errors}/${totals.old.requests} errors/requests`;
  if (totals.new.requests < minRequests) {
    return {
      ok: true,
      lowSample: true,
      summary: `${summary}; fewer than ${minRequests} requests reached the new version, so the error rate was not judged and the probes decided`,
    };
  }
  if (rate(totals.new) > rate(totals.old) + maxExtraErrorPoints / 100) {
    return {
      ok: false,
      lowSample: false,
      summary: `${summary}; the new version errors more than ${maxExtraErrorPoints} point(s) above the old one`,
    };
  }
  return { ok: true, lowSample: false, summary };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function productionConfig(ref) {
  const text = ref
    ? (await run("git", ["show", `${ref}:${configFile}`])).stdout
    : await readFile(resolve(import.meta.dirname, "..", configFile), "utf8");
  return parseJsonc(text);
}

async function wrangler(args) {
  const { stdout } = await run(
    "./node_modules/.bin/wrangler",
    [...args, "--config", "wrangler.deploy.jsonc", "--env", "production"],
    { cwd: apiDirectory, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

async function workerAnalytics(workerName, from, to) {
  const query = `query ($account: String!, $script: String!, $from: Time!, $to: Time!) {
    viewer { accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 100, filter: { scriptName: $script, datetime_geq: $from, datetime_leq: $to }) {
        sum { requests errors }
        dimensions { scriptVersion }
      }
    } }
  }`;
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("CLOUDFLARE_API_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        account: required("CLOUDFLARE_ACCOUNT_ID"),
        script: workerName,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  const rows = body?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!response.ok || body.errors?.length || !Array.isArray(rows)) {
    throw new Error(
      `Workers analytics query failed (HTTP ${response.status}): ${JSON.stringify(body.errors ?? [])}. The Cloudflare token needs Account Analytics: Read.`,
    );
  }
  return rows;
}

async function writeOutputs(values) {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`);
  await appendFile(required("GITHUB_OUTPUT"), `${lines.join("\n")}\n`);
}

async function plan() {
  const current = await productionConfig();
  const workerName = current.env.production.name;
  const previous = servingVersion(JSON.parse(await wrangler(["deployments", "status", "--json"])));
  const { stdout } = await run("git", ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]);
  const lastRelease = stdout.trim();
  const atomic = atomicSettings(current) !== atomicSettings(await productionConfig(lastRelease));
  const now = new Date();
  await workerAnalytics(workerName, new Date(now.getTime() - 5 * 60_000), now);
  await writeOutputs({
    previous_version: previous,
    strategy: atomic ? "atomic" : "gradual",
    worker_name: workerName,
  });
  console.log(
    atomic
      ? `Durable Object migrations or queue consumers changed since ${lastRelease}; deploying atomically.`
      : `Rolling out gradually from version ${previous}.`,
  );
}

async function expectProbe(label, url, init, validate) {
  const response = await fetch(url, init);
  await validate(response);
  console.log(`✓ ${label}`);
}

async function probeOnce(workerName, version) {
  const apiUrl = required("API_URL").replace(/\/$/, "");
  const pinned = overrideHeader(workerName, version);
  await expectProbe(
    "new version is healthy",
    `${apiUrl}/health`,
    { headers: pinned },
    async (r) => {
      const body = await r.json().catch(() => ({}));
      if (r.status !== 200 || body.status !== "ok")
        throw new Error(`/health returned ${r.status}.`);
      if (body.version !== version) {
        throw new Error(`/health answered from version ${body.version}, not ${version}.`);
      }
    },
  );
  await expectProbe(
    "new version rejects anonymous access",
    `${apiUrl}/api/app/dashboard?from=2026-07-01&to=2026-07-31`,
    { headers: { ...pinned, Origin: new URL(required("APP_URL")).origin } },
    async (r) => {
      if (r.status !== 401) throw new Error(`Private API returned ${r.status} instead of 401.`);
    },
  );
}

async function probe() {
  const workerName = (await productionConfig()).env.production.name;
  const version = required("NEW_VERSION");
  // A new deployment takes a few seconds to reach every location the probes may land on.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await probeOnce(workerName, version);
      return;
    } catch (error) {
      if (attempt === 12) throw error;
      await delay(5_000);
    }
  }
}

async function summaryNote(text) {
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

async function soak() {
  const workerName = (await productionConfig()).env.production.name;
  const version = required("NEW_VERSION");
  const minutes = numberFromEnv("CANARY_DWELL_MINUTES", DEFAULTS.dwellMinutes);
  const thresholds = {
    maxExtraErrorPoints: numberFromEnv(
      "CANARY_MAX_EXTRA_ERROR_POINTS",
      DEFAULTS.maxExtraErrorPoints,
    ),
    minRequests: numberFromEnv("CANARY_MIN_REQUESTS", DEFAULTS.minRequests),
  };
  const start = new Date();
  for (let elapsed = 0; elapsed < minutes * 60_000; elapsed += 30_000) {
    await delay(30_000);
    await probeOnce(workerName, version);
  }
  let rows;
  try {
    rows = await workerAnalytics(workerName, start, new Date());
  } catch (error) {
    // Promoting a release nobody can measure is the risk the soak exists to remove.
    await summaryNote(
      `### Canary\n\n**Analytics could not be queried after the ${minutes} minute soak, so the release is being rolled back.** ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
  const verdict = judgeSoak(rows, version, thresholds);
  console.log(`Soak over ${minutes} minutes: ${verdict.summary}.`);
  await writeOutputs({ low_sample: String(verdict.lowSample), soak_summary: verdict.summary });
  if (verdict.lowSample) {
    console.log(`::warning::Canary promoted on probes alone: ${verdict.summary}.`);
  }
  await summaryNote(
    `### Canary\n\n${verdict.lowSample ? "**Warning: promoted on probes alone.** " : ""}${minutes} minute soak: ${verdict.summary}.`,
  );
  if (!verdict.ok) throw new Error(verdict.summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  const commands = { plan, probe, soak };
  if (!commands[command]) throw new Error("Usage: worker-canary.mjs plan|probe|soak");
  try {
    await commands[command]();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
