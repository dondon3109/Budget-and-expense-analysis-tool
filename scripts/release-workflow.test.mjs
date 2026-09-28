import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// The babysit-release watcher recognises a superseded CI result by a failed step with this exact
// name, and release.yml keeps two copies of that guard on purpose. A rename or a drift between the
// copies breaks the watcher silently, so this pins both to the watcher's constant.
async function guardSteps() {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  const watcher = await readFile(
    ".agents/skills/babysit-release/scripts/gh_release_watch.py",
    "utf8",
  );
  const stepName = watcher.match(/^RELEASE_SOURCE_GUARD_STEP = "([^"]+)"$/m)?.[1];
  const steps = workflow.split(/\n(?= {6}- )/).filter((step) => step.includes(`name: ${stepName}`));
  return { stepName, steps };
}

describe("Production Release source guard", () => {
  it("appears once in each job under the name the release watcher keys on", async () => {
    const { stepName, steps } = await guardSteps();
    expect(stepName).toBeTruthy();
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
});
