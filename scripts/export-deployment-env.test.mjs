import { describe, expect, it } from "vitest";

import { deploymentEnvironment } from "./export-deployment-env.mjs";

const config = {
  env: {
    preview: {
      vars: {
        SUPABASE_URL: "https://preview.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_preview",
        WEB_APP_URL: "https://clarity-budget-preview.pages.dev",
      },
    },
    production: {
      vars: {
        SUPABASE_URL: "https://production.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
        WEB_APP_URL: "https://app.zoption.site",
      },
    },
  },
};

describe("deployment environment", () => {
  it("derives production Pages and smoke values from the Wrangler environments", () => {
    expect(deploymentEnvironment(config, "production")).toEqual({
      VITE_API_URL: "https://api.zoption.site",
      VITE_SUPABASE_URL: "https://production.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
      FORBIDDEN_SUPABASE_ORIGINS: "https://preview.supabase.co",
      EXPECTED_SUPABASE_URL: "https://production.supabase.co",
      SITE_URL: "https://zoption.site",
      APP_URL: "https://app.zoption.site",
      API_URL: "https://api.zoption.site",
    });
  });

  it("points a preview build and smoke run at preview only, never indexed", () => {
    const preview = deploymentEnvironment(config, "preview");
    expect(preview).toMatchObject({
      VITE_SUPABASE_URL: "https://preview.supabase.co",
      FORBIDDEN_SUPABASE_ORIGINS: "https://production.supabase.co",
      APP_URL: "https://clarity-budget-preview.pages.dev",
      PUBLIC_APP_URL: "https://clarity-budget-preview.pages.dev",
      EXPECT_SEARCH_INDEXING: "0",
    });
    expect(Object.values(preview).join(" ")).not.toContain("zoption.site/");
    expect(preview.API_URL).not.toBe("https://api.zoption.site");
  });

  it("rejects missing or multiline public values", () => {
    const unsafe = structuredClone(config);
    unsafe.env.production.vars.SUPABASE_URL = "https://production.supabase.co\nUNSAFE=value";
    expect(() => deploymentEnvironment(unsafe, "production")).toThrow("single-line string");
    expect(() => deploymentEnvironment(config, "staging")).toThrow("production or preview");
  });
});
