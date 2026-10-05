import { describe, expect, it } from "vitest";

import { pickDeploymentForCommit } from "./rollback-pages.mjs";

function deployment(id, overrides = {}) {
  return {
    id,
    environment: "production",
    created_on: "2026-10-01T00:00:00Z",
    deployment_trigger: { metadata: { commit_hash: "abc123" } },
    latest_stage: { name: "deploy", status: "success" },
    ...overrides,
  };
}

describe("pickDeploymentForCommit", () => {
  it("picks the newest successful production deployment of the commit", () => {
    const older = deployment("older");
    const newer = deployment("newer", { created_on: "2026-10-02T00:00:00Z" });
    expect(pickDeploymentForCommit([older, newer], "abc123")).toBe(newer);
  });

  it("never picks a preview, failed, or other-commit deployment", () => {
    const candidates = [
      deployment("preview", { environment: "preview" }),
      deployment("failed", { latest_stage: { name: "deploy", status: "failure" } }),
      deployment("building", { latest_stage: { name: "build", status: "success" } }),
      deployment("other", { deployment_trigger: { metadata: { commit_hash: "def456" } } }),
    ];
    expect(pickDeploymentForCommit(candidates, "abc123")).toBeUndefined();
  });
});
