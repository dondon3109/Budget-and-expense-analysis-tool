import { describe, expect, it } from "vitest";

import { deploymentProgress } from "./github-production-deployment.mjs";

describe("production deployment retry checkpoints", () => {
  it("resumes after the Worker without redeploying it", () => {
    expect(deploymentProgress([{ description: "worker-deployed", state: "in_progress" }])).toEqual({
      complete: false,
      pagesDeployed: false,
      siteDeployed: false,
      workerDeployed: true,
    });
  });

  it("resumes after the app without redeploying it or the Worker", () => {
    expect(
      deploymentProgress([
        { description: "worker-deployed", state: "in_progress" },
        { description: "pages-deployed", state: "in_progress" },
      ]),
    ).toEqual({ complete: false, pagesDeployed: true, siteDeployed: false, workerDeployed: true });
  });

  it("skips every Cloudflare surface after full success", () => {
    expect(deploymentProgress([{ state: "success" }])).toEqual({
      complete: true,
      pagesDeployed: true,
      siteDeployed: true,
      workerDeployed: true,
    });
  });
});
