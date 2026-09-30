import { describe, expect, it } from "vitest";

import { createSiteContentSecurityPolicy, resolveSiteDeploymentConfig } from "../deployment-config";

describe("site deployment config", () => {
  it("defaults a local build to the production origins with indexing on", () => {
    expect(resolveSiteDeploymentConfig({})).toMatchObject({
      deployEnvironment: "production",
      indexingEnabled: true,
      apiOrigin: "https://api.zoption.site",
      appOrigin: "https://app.zoption.site",
    });
  });

  it("fails closed for Pages builds without an environment or analytics key", () => {
    expect(() => resolveSiteDeploymentConfig({ CF_PAGES: "1" })).toThrow(/ZOPTION_DEPLOY_ENV/);
    expect(() =>
      resolveSiteDeploymentConfig({ CF_PAGES: "1", ZOPTION_DEPLOY_ENV: "production" }),
    ).toThrow(/PUBLIC_POSTHOG_KEY/);
  });

  it("requires preview builds to name non-production origins", () => {
    expect(() => resolveSiteDeploymentConfig({ ZOPTION_DEPLOY_ENV: "preview" })).toThrow(
      /PUBLIC_API_URL/,
    );
    expect(() =>
      resolveSiteDeploymentConfig({
        ZOPTION_DEPLOY_ENV: "preview",
        PUBLIC_API_URL: "https://api.zoption.site",
        PUBLIC_APP_URL: "https://preview.app.example",
      }),
    ).toThrow(/production API/);
    expect(
      resolveSiteDeploymentConfig({
        ZOPTION_DEPLOY_ENV: "preview",
        PUBLIC_API_URL: "https://api-preview.example",
        PUBLIC_APP_URL: "https://preview.app.example",
      }).indexingEnabled,
    ).toBe(false);
  });

  it("accepts local http origins for the end-to-end suite but never in a Pages build", () => {
    const local = {
      ZOPTION_DEPLOY_ENV: "preview",
      PUBLIC_API_URL: "http://localhost:8787",
      PUBLIC_APP_URL: "http://localhost:5173",
    };
    expect(resolveSiteDeploymentConfig(local).appOrigin).toBe("http://localhost:5173");
    expect(() => resolveSiteDeploymentConfig({ ...local, CF_PAGES: "1" })).toThrow(
      /must use HTTPS/,
    );
    expect(() =>
      resolveSiteDeploymentConfig({ ...local, PUBLIC_API_URL: "http://api.example" }),
    ).toThrow(/must use HTTPS/);
  });

  it("rejects production pointed anywhere but the production API and app", () => {
    expect(() =>
      resolveSiteDeploymentConfig({ PUBLIC_API_URL: "https://api-preview.example" }),
    ).toThrow(/production API/);
    expect(() =>
      resolveSiteDeploymentConfig({ PUBLIC_APP_URL: "https://zoption.site/app" }),
    ).toThrow(/without credentials, a path/);
  });

  it("allows scripts only from this origin and connections only to its API and downloads", () => {
    const policy = createSiteContentSecurityPolicy(resolveSiteDeploymentConfig({}));
    expect(policy).toContain("script-src 'self';");
    expect(policy).toContain(
      "connect-src 'self' https://api.zoption.site https://downloads.zoption.site;",
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("*");
  });
});
