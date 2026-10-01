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
    expect(gatedJob).toMatch(/^ {4}concurrency:\n {6}group: production-release-main$/m);
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
