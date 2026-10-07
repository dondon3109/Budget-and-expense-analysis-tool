import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// release.yml keeps two copies of the source guard on purpose. A rename or a drift between the
// copies breaks the superseded-run handling silently, so this pins both by name and content.
const GUARD_STEP_NAME = "Verify release source";

async function guardSteps() {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  const steps = workflow
    .split(/\n(?= {6}- )/)
    .filter((step) => step.includes(`name: ${GUARD_STEP_NAME}`));
  return { steps };
}

describe("Production Release source guard", () => {
  it("appears once in each job", async () => {
    const { steps } = await guardSteps();
    expect(steps).toHaveLength(2);
  });

  it("keeps both copies byte-identical", async () => {
    const { steps } = await guardSteps();
    expect(steps[0]?.trim()).toBe(steps[1]?.trim());
  });
});

describe("Production Release concurrency", () => {
  // A workflow-level group let a run parked at the production gate block every later run's
  // preflight, so releases queued for over a day behind a superseded approval.
  it("holds the group on the gated job, not the workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");
    expect(workflow).not.toMatch(/^concurrency:/m);
    const gatedJob = workflow.slice(workflow.indexOf("\n  deploy-and-release:"));
    expect(gatedJob).toMatch(/^ {4}concurrency:\n {6}group: production$/m);
  });

  // The sweep must run only after preflight's source guard, touch only older runs of another
  // commit, and hold the one actions: write token away from the dependency install.
  it("cancels only older parked runs, after preflight, from a job that installs nothing", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");
    const start = workflow.indexOf("\n  cancel-superseded:");
    const sweep = workflow.slice(start, workflow.indexOf("\n  deploy-and-release:"));
    expect(start).toBeGreaterThan(-1);
    expect(sweep).toMatch(/^ {4}needs: preflight$/m);
    expect(sweep).toMatch(/^ {4}permissions:\n {6}actions: write\n {4}steps:/m);
    expect(sweep).not.toMatch(/checkout|pnpm install/);
    expect(sweep).toContain('.databaseId < $RUN_ID and .headSha != \\"$RELEASE_COMMIT\\"');
    expect(workflow.match(/^ +actions: write$/gm)).toHaveLength(1);
  });
});

// Splits release.yml into its jobs, keyed by name, from the two-space-indented job headers.
async function jobs() {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  const body = workflow.slice(workflow.indexOf("\njobs:\n") + 7);
  return Object.fromEntries(
    body.split(/\n(?= {2}[a-z][a-z-]*:\n)/).map((job) => [job.trim().split(":")[0], job]),
  );
}

describe("Production Release privileges", () => {
  // preflight's dry run authenticates a push, and publish-release tags the release. Nothing else,
  // the deploy job included, may be able to write repository contents.
  it("lets only preflight and publish-release write contents", async () => {
    const withWrite = Object.entries(await jobs())
      .filter(([, job]) => /^ {6}contents: write$/m.test(job))
      .map(([name]) => name);
    expect(withWrite).toEqual(["preflight", "publish-release"]);
  });

  it("publishes only after the gated deploy job succeeded", async () => {
    const { "publish-release": publish, "deploy-and-release": deploy } = await jobs();
    expect(publish).toMatch(/^ {4}needs: \[preflight, deploy-and-release\]$/m);
    expect(publish).toMatch(/^ {4}if: needs\.deploy-and-release\.result == 'success'$/m);
    expect(publish).not.toMatch(/environment:|CLOUDFLARE_API_TOKEN/);
    expect(deploy).not.toContain("pnpm release");
  });

  // The Cloudflare token reaches a job only through the preview or production environment.
  it("reads the Cloudflare token only in jobs that name an environment", async () => {
    const offenders = Object.entries(await jobs())
      .filter(([, job]) => job.includes("secrets.CLOUDFLARE_API_TOKEN"))
      .filter(([, job]) => !/^ {4}environment: (preview|production)$/m.test(job))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it("shows the approver a summary before the gate and cannot be skipped", async () => {
    const { "deploy-and-release": deploy, "approval-summary": summary } = await jobs();
    expect(deploy).toMatch(/^ {4}needs: \[.*approval-summary.*\]$/m);
    expect(summary).toContain("node scripts/release-summary.mjs");
    expect(summary).not.toMatch(/environment:|CLOUDFLARE_API_TOKEN|contents: write/);
  });
});

describe("Cancel Superseded Releases", () => {
  // It runs on every push to main with the only actions: write token outside release.yml, so it
  // must never check out or install code, and must never cancel a release of the pushed commit.
  it("cancels only parked releases of other commits, without touching the code", async () => {
    const workflow = await readFile(".github/workflows/release-superseded.yml", "utf8");
    expect(workflow).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    // Read-only by default; only the one job holds actions: write.
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(workflow).toMatch(/^ {4}permissions:\n {6}actions: write\n {4}steps:/m);
    expect(workflow.match(/actions: write/g)).toHaveLength(1);
    expect(workflow).not.toMatch(/checkout|pnpm|uses:/);
    expect(workflow).toContain("--status waiting");
    expect(workflow).toContain('select(.headSha != \\"$MAIN_COMMIT\\")');
  });
});
