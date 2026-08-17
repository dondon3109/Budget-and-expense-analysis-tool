import { describe, expect, it } from "vitest";

import { productionDeploymentEnvironment } from "./export-production-deployment-env.mjs";

describe("production deployment environment", () => {
  it("derives Pages and smoke values from the existing Wrangler environments", () => {
    expect(
      productionDeploymentEnvironment({
        env: {
          preview: { vars: { SUPABASE_URL: "https://preview.supabase.co" } },
          production: {
            vars: {
              SUPABASE_URL: "https://production.supabase.co",
              SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
            },
          },
        },
      }),
    ).toEqual({
      VITE_API_URL: "https://api.zoption.site",
      VITE_SUPABASE_URL: "https://production.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
      FORBIDDEN_SUPABASE_ORIGINS: "https://preview.supabase.co",
      EXPECTED_SUPABASE_URL: "https://production.supabase.co",
    });
  });

  it("rejects missing or multiline public values", () => {
    expect(() =>
      productionDeploymentEnvironment({
        env: {
          preview: { vars: { SUPABASE_URL: "https://preview.supabase.co" } },
          production: {
            vars: {
              SUPABASE_URL: "https://production.supabase.co\nUNSAFE=value",
              SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
            },
          },
        },
      }),
    ).toThrow("single-line string");
  });
});
