// The production Worker's gradual rollout, run by the Production Release workflow between
// `wrangler versions upload` and the final `wrangler versions deploy <new>@100`.
//
//   plan   Reads the live deployment and decides the strategy. A change to Durable Object
//          migrations or queue consumers since the last release cannot ride a gradual rollout
//          (Cloudflare applies both only on `wrangler deploy`), so those go out atomically.
//          Also proves the token can read Workers analytics before anything is deployed.
//   probe  Sends version-pinned requests (Cloudflare-Workers-Version-Overrides) to the new
//          version while it serves 0% of traffic, and checks /health reports that version.
//   soak   Holds the canary percentage, probing every 30 seconds, then compares the new
//          version's invocation error rate with the old one's over the same window.
//
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, API_URL, APP_URL, and for probe/soak
// NEW_VERSION (and SOAK_MINUTES for soak). Outputs go to GITHUB_OUTPUT.
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

// Below this many requests on the new version the error rate is noise; the probes decide alone.
const MIN_JUDGED_REQUESTS = 20;
// The new version may exceed the old version's error rate by at most this much.
const MAX_EXTRA_ERROR_RATE = 0.01;

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

/** Pass/fail for the soak window from analytics rows grouped by scriptVersion. */
export function judgeSoak(rows, newVersion) {
  const totals = { new: { requests: 0, errors: 0 }, old: { requests: 0, errors: 0 } };
  for (const row of rows) {
    const side = row.dimensions.scriptVersion === newVersion ? totals.new : totals.old;
    side.requests += row.sum.requests;
    side.errors += row.sum.errors;
  }
  const rate = ({ requests, errors }) => (requests === 0 ? 0 : errors / requests);
  const summary = `new ${totals.new.errors}/${totals.new.requests}, old ${totals.old.errors}/${totals.old.requests} errors/requests`;
  if (totals.new.requests < MIN_JUDGED_REQUESTS) {
    return { ok: true, summary: `${summary}; too little traffic to judge, probes decided` };
  }
  if (rate(totals.new) > rate(totals.old) + MAX_EXTRA_ERROR_RATE) {
    return { ok: false, summary: `${summary}; the new version errors more than the old one` };
  }
  return { ok: true, summary };
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

async function soak() {
  const workerName = (await productionConfig()).env.production.name;
  const version = required("NEW_VERSION");
  const minutes = Number(required("SOAK_MINUTES"));
  const start = new Date();
  for (let elapsed = 0; elapsed < minutes * 60_000; elapsed += 30_000) {
    await delay(30_000);
    await probeOnce(workerName, version);
  }
  const verdict = judgeSoak(await workerAnalytics(workerName, start, new Date()), version);
  console.log(`Soak over ${minutes} minutes: ${verdict.summary}.`);
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
