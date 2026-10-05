// Rolls one Cloudflare Pages project's production back to the deployment built from a given
// commit. The Production Rollback workflow runs it for the app and the public site; the release
// pipeline stamps every production Pages deployment with its commit, so the commit identifies it.
//
//   node scripts/rollback-pages.mjs <project-name>
//   (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, TARGET_COMMIT)
import { pathToFileURL } from "node:url";

const PAGES_PER_REQUEST = 25;
// Four pages of history reach far enough back for any rollback worth automating; anything older
// fails closed and goes through the emergency runbook in docs/deployment.md.
const MAX_PAGES = 4;

/** The newest successful production deployment built from `commit`, or undefined. */
export function pickDeploymentForCommit(deployments, commit) {
  return deployments
    .filter(
      (deployment) =>
        deployment.environment === "production" &&
        deployment.deployment_trigger?.metadata?.commit_hash === commit &&
        deployment.latest_stage?.name === "deploy" &&
        deployment.latest_stage?.status === "success",
    )
    .sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function cloudflare(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${requiredEnvironment("CLOUDFLARE_API_TOKEN")}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) {
    const errors = JSON.stringify(body.errors ?? []);
    throw new Error(`Cloudflare API ${path} returned HTTP ${response.status}: ${errors}`);
  }
  return body.result;
}

async function main() {
  const project = process.argv[2];
  if (!project) throw new Error("Usage: rollback-pages.mjs <project-name>");
  const account = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const commit = requiredEnvironment("TARGET_COMMIT");
  const projectPath = `/accounts/${account}/pages/projects/${encodeURIComponent(project)}`;
  const base = `${projectPath}/deployments`;

  // An automatic rollback can run before this release reached Pages; rolling back onto the
  // deployment already serving would only churn the project.
  const { canonical_deployment: serving } = await cloudflare(projectPath);
  if (serving?.deployment_trigger?.metadata?.commit_hash === commit) {
    console.log(`${project}: production already serves ${commit}.`);
    return;
  }

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const deployments = await cloudflare(
      `${base}?env=production&page=${page}&per_page=${PAGES_PER_REQUEST}`,
    );
    const target = pickDeploymentForCommit(deployments, commit);
    if (target) {
      await cloudflare(`${base}/${target.id}/rollback`, { method: "POST" });
      console.log(`${project}: production rolled back to deployment ${target.id} (${commit}).`);
      return;
    }
    if (deployments.length < PAGES_PER_REQUEST) break;
  }
  throw new Error(
    `${project}: no successful production deployment of ${commit} in the last ${MAX_PAGES * PAGES_PER_REQUEST}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
