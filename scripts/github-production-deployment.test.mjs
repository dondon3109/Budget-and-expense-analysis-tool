import { describe, expect, it } from "vitest";

import { deploymentProgress } from "./github-production-deployment.mjs";

describe("production deployment retry checkpoints", () => {
  it("resumes after the Worker without redeploying it", () => {
    expect(deploymentProgress([{ description: "worker-deployed", state: "in_progress" }])).toEqual({
      complete: false,
      pagesDeployed: false,
      workerDeployed: true,
    });
  });

  it("skips both Cloudflare surfaces after full success", () => {
    expect(deploymentProgress([{ state: "success" }])).toEqual({
      complete: true,
      pagesDeployed: true,
      workerDeployed: true,
    });
  });
});
