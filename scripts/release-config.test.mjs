import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { describe, expect, it } from "vitest";

import releaseConfig from "../release.config.mjs";

const analyzerConfig = releaseConfig.plugins.find(
  ([plugin]) => plugin === "@semantic-release/commit-analyzer",
)?.[1];
const logger = { log() {} };

async function releaseType(message) {
  return analyzeCommits(analyzerConfig, { commits: [{ message }], logger });
}

describe("semantic-release commit mapping", () => {
  it.each([
    ["fix: correct totals", "patch"],
    ["feat(web): add budgets", "minor"],
    ["feat!: replace the API", "major"],
    ["refactor: replace internals\n\nBREAKING CHANGE: remove the old API", "major"],
  ])("maps %s to %s", async (message, expected) => {
    await expect(releaseType(message)).resolves.toBe(expected);
  });

  it.each([
    "docs: update deployment guidance",
    "test: cover totals",
    "chore: refresh tooling",
    "refactor: simplify parsing",
    "perf: reduce allocations",
    "ops: update an unknown system",
  ])("does not release for %s", async (message) => {
    await expect(releaseType(message)).resolves.toBeNull();
  });
});
