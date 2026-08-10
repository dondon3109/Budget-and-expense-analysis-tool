import { describe, expect, it } from "vitest";

import {
  addContentSecurityPolicy,
  createContentSecurityPolicy,
  isSupabasePublishableKey,
  validateDeploymentConfigForBuild,
  verifyContentSecurityPolicy,
} from "../deployment-config";

const productionApiUrl = "https://api.zoption.site";
const previewApiUrl = "https://budget-expense-api-preview.dondon3109.workers.dev";
const supabaseUrl = "https://project-ref.supabase.co";
const publishableKey = "sb_publishable_public-test-key";
const cloudflareAnalyticsToken = "0123456789abcdef0123456789abcdef";

function validInput(deployEnvironment: "production" | "preview" | "staging" = "production") {
  const apiUrl = deployEnvironment === "production" ? productionApiUrl : previewApiUrl;
  return {
    command: "build",
    deployEnvironment,
    effectiveApiUrl: apiUrl,
    explicitApiUrl: apiUrl,
    effectiveSupabaseUrl: supabaseUrl,
    explicitSupabaseUrl: supabaseUrl,
    effectiveSupabasePublishableKey: publishableKey,
    explicitSupabasePublishableKey: publishableKey,
  } as const;
}

describe("deployment build validation", () => {
  it("accepts exact HTTPS production deployment origins", () => {
    expect(validateDeploymentConfigForBuild(validInput())).toMatchObject({
      deployEnvironment: "production",
      apiOrigin: productionApiUrl,
      supabaseOrigin: supabaseUrl,
    });
  });

  it.each(["preview", "staging"] as const)(
    "requires all public deployment values explicitly for %s builds",
    (deployEnvironment) => {
      expect(() =>
        validateDeploymentConfigForBuild({
          ...validInput(deployEnvironment),
          explicitSupabasePublishableKey: undefined,
        }),
      ).toThrow(
        `VITE_SUPABASE_PUBLISHABLE_KEY must be set explicitly for ${deployEnvironment} builds`,
      );
    },
  );

  it.each(["preview", "staging"] as const)(
    "rejects the production API for %s builds",
    (deployEnvironment) => {
      expect(() =>
        validateDeploymentConfigForBuild({
          ...validInput(deployEnvironment),
          effectiveApiUrl: productionApiUrl,
          explicitApiUrl: productionApiUrl,
        }),
      ).toThrow(`${deployEnvironment} builds must not use the production API`);
    },
  );

  it("rejects a non-production API for production builds", () => {
    expect(() =>
      validateDeploymentConfigForBuild({
        ...validInput(),
        effectiveApiUrl: previewApiUrl,
        explicitApiUrl: previewApiUrl,
      }),
    ).toThrow("Production builds must use the production API");
  });

  it.each([
    ["VITE_API_URL", "http://api.example.com"],
    ["VITE_API_URL", "https://api.example.com/v1"],
    ["VITE_SUPABASE_URL", "https://project-ref.supabase.co/auth/v1"],
  ] as const)("rejects an unsafe or non-origin %s", (name, value) => {
    const input = validInput("preview");
    const override =
      name === "VITE_API_URL"
        ? { effectiveApiUrl: value, explicitApiUrl: value }
        : { effectiveSupabaseUrl: value, explicitSupabaseUrl: value };
    expect(() => validateDeploymentConfigForBuild({ ...input, ...override })).toThrow(name);
  });

  it("accepts current publishable keys and legacy anon keys only", () => {
    const legacyAnonPayload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
    const legacyServicePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString(
      "base64url",
    );

    expect(isSupabasePublishableKey(publishableKey)).toBe(true);
    expect(isSupabasePublishableKey(`header.${legacyAnonPayload}.signature`)).toBe(true);
    expect(isSupabasePublishableKey("sb_secret_backend-key")).toBe(false);
    expect(isSupabasePublishableKey(`header.${legacyServicePayload}.signature`)).toBe(false);
  });

  it("rejects secret and service-role key types without echoing the value", () => {
    const secret = "sb_secret_do-not-expose";
    expect(() =>
      validateDeploymentConfigForBuild({
        ...validInput(),
        effectiveSupabasePublishableKey: secret,
      }),
    ).toThrow(/secret and service-role keys are forbidden/);

    try {
      validateDeploymentConfigForBuild({
        ...validInput(),
        effectiveSupabasePublishableKey: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("environment-derived CSP", () => {
  it("generates and verifies exact API and Supabase origins without provider wildcards", () => {
    const resolved = validateDeploymentConfigForBuild(validInput());
    if (!resolved) throw new Error("Expected a resolved deployment config.");
    const policy = createContentSecurityPolicy(resolved);
    const headers = addContentSecurityPolicy("/*\n  X-Frame-Options: DENY\n", policy);

    expect(policy).toContain(`img-src 'self' data: blob: ${supabaseUrl}`);
    expect(policy).toContain(`connect-src 'self' ${supabaseUrl} ${productionApiUrl}`);
    expect(policy).not.toContain("*.supabase.co");
    expect(policy).not.toContain("*.workers.dev");
    expect(() => verifyContentSecurityPolicy(headers, policy)).not.toThrow();
  });

  it("allows analytics origins only when the deployment enables analytics", () => {
    const withoutAnalytics = validateDeploymentConfigForBuild(validInput());
    const withAnalytics = validateDeploymentConfigForBuild({
      ...validInput(),
      analyticsMeasurementId: "G-APPROVED",
    });
    if (!withoutAnalytics || !withAnalytics) throw new Error("Expected deployment configs.");

    expect(createContentSecurityPolicy(withoutAnalytics)).not.toContain("googletagmanager.com");
    const analyticsPolicy = createContentSecurityPolicy(withAnalytics);
    expect(analyticsPolicy).toContain("https://www.googletagmanager.com");
    expect(analyticsPolicy).toContain("https://www.google-analytics.com");
    expect(analyticsPolicy).toContain("https://region1.google-analytics.com");
    expect(analyticsPolicy).not.toContain("*.google-analytics.com");
  });

  it("allows Cloudflare Web Analytics origins only for production with a valid site token", () => {
    const withoutCloudflareAnalytics = validateDeploymentConfigForBuild(validInput());
    const withCloudflareAnalytics = validateDeploymentConfigForBuild({
      ...validInput(),
      cloudflareAnalyticsToken,
    });
    const previewWithProductionToken = validateDeploymentConfigForBuild({
      ...validInput("preview"),
      cloudflareAnalyticsToken,
    });
    if (!withoutCloudflareAnalytics || !withCloudflareAnalytics || !previewWithProductionToken) {
      throw new Error("Expected deployment configs.");
    }

    expect(createContentSecurityPolicy(withoutCloudflareAnalytics)).not.toContain(
      "cloudflareinsights.com",
    );
    const cloudflarePolicy = createContentSecurityPolicy(withCloudflareAnalytics);
    expect(cloudflarePolicy).toContain("https://static.cloudflareinsights.com");
    expect(cloudflarePolicy).toContain("https://cloudflareinsights.com");
    expect(cloudflarePolicy).not.toContain("*.cloudflareinsights.com");
    expect(createContentSecurityPolicy(previewWithProductionToken)).not.toContain(
      "cloudflareinsights.com",
    );
    expect(() =>
      validateDeploymentConfigForBuild({
        ...validInput(),
        cloudflareAnalyticsToken: "invalid-token",
      }),
    ).toThrow("must be a 32-character site token");
  });

  it("rejects static, mismatched, or wildcard CSP headers", () => {
    expect(() =>
      addContentSecurityPolicy(
        "/*\n  Content-Security-Policy: default-src 'self'\n",
        "default-src 'self'",
      ),
    ).toThrow("must not contain a static Content-Security-Policy");
    expect(() =>
      verifyContentSecurityPolicy(
        "/*\n  Content-Security-Policy: default-src 'self'\n",
        "default-src 'none'",
      ),
    ).toThrow("exactly the environment-derived CSP");
    const wildcardPolicy = "default-src 'self'; connect-src https://*.google-analytics.com";
    expect(() =>
      verifyContentSecurityPolicy(
        `/*\n  Content-Security-Policy: ${wildcardPolicy}\n`,
        wildcardPolicy,
      ),
    ).toThrow("must not contain wildcard sources");
  });
});
