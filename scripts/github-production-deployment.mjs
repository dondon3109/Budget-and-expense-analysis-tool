import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const environment = "production";
const deploymentTask = "deploy:cloudflare";
const stageDescriptions = {
  pages: "pages-deployed",
  worker: "worker-deployed",
};

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function githubRequest(path, options = {}) {
  const token = requiredEnvironment("GITHUB_TOKEN");
  const apiUrl = process.env.GITHUB_API_URL?.trim() || "https://api.github.com";
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`GitHub deployment API returned HTTP ${response.status}.`);
  return response.status === 204 ? undefined : response.json();
}

async function deploymentStatuses(repository, deploymentId) {
  return githubRequest(`/repos/${repository}/deployments/${deploymentId}/statuses?per_page=100`);
}

async function deploymentsForCommit(repository, sha) {
  const deployments = await githubRequest(
    `/repos/${repository}/deployments?sha=${encodeURIComponent(sha)}&environment=${environment}&per_page=100`,
  );
  return deployments.filter((deployment) => deployment.task === deploymentTask);
}

export function deploymentProgress(statuses) {
  const complete = statuses.some((status) => status.state === "success");
  return {
    complete,
    pagesDeployed:
      complete ||
      statuses.some(
        (status) =>
          status.description === stageDescriptions.pages && status.state === "in_progress",
      ),
    workerDeployed:
      complete ||
      statuses.some(
        (status) =>
          status.description === stageDescriptions.worker && status.state === "in_progress",
      ),
  };
}

async function createDeployment(repository, sha) {
  const deployment = await githubRequest(`/repos/${repository}/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auto_merge: false,
      description: "Cloudflare Worker and Pages production release",
      environment,
      production_environment: true,
      ref: sha,
      required_contexts: [],
      task: deploymentTask,
      transient_environment: false,
    }),
  });
  await createDeploymentStatus(repository, deployment.id, "in_progress");
  return deployment;
}

async function createDeploymentStatus(repository, deploymentId, state, description) {
  return githubRequest(`/repos/${repository}/deployments/${deploymentId}/statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      environment,
      environment_url: state === "success" ? "https://zoption.site" : undefined,
      description,
      state,
    }),
  });
}

async function writeOutputs(values) {
  const outputPath = requiredEnvironment("GITHUB_OUTPUT");
  await appendFile(
    outputPath,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
}

async function begin() {
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  const sha = requiredEnvironment("RELEASE_COMMIT");
  const [existing] = await deploymentsForCommit(repository, sha);
  const deployment = existing ?? (await createDeployment(repository, sha));
  const progress = deploymentProgress(await deploymentStatuses(repository, deployment.id));
  await writeOutputs({
    deployment_id: deployment.id,
    pages_deployed: progress.pagesDeployed,
    skip_deploy: progress.complete,
    worker_deployed: progress.workerDeployed,
  });
  console.log(
    existing
      ? `Resuming production deployment ${deployment.id} for ${sha}.`
      : `Started production deployment ${deployment.id} for ${sha}.`,
  );
}

async function finish(state) {
  if (state !== "success" && state !== "failure") {
    throw new Error("Deployment state must be success or failure.");
  }
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  const deploymentId = requiredEnvironment("DEPLOYMENT_ID");
  await createDeploymentStatus(repository, deploymentId, state);
  console.log(`Marked production deployment ${deploymentId} as ${state}.`);
}

async function stage(name) {
  const description = stageDescriptions[name];
  if (!description) throw new Error("Deployment stage must be worker or pages.");
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  const deploymentId = requiredEnvironment("DEPLOYMENT_ID");
  await createDeploymentStatus(repository, deploymentId, "in_progress", description);
  console.log(`Checkpointed ${name} for production deployment ${deploymentId}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, state] = process.argv.slice(2);
  if (command === "begin") await begin();
  else if (command === "finish") await finish(state);
  else if (command === "stage") await stage(state);
  else {
    throw new Error(
      "Usage: github-production-deployment.mjs begin|stage <worker|pages>|finish <success|failure>",
    );
  }
}
