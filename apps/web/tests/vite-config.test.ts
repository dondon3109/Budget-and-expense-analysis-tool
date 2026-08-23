import { describe, expect, it } from "vitest";

import {
  addContentSecurityPolicy,
  addAssistantVoiceMicrophonePermission,
  createContentSecurityPolicy,
  isSupabasePublishableKey,
  resolveAppVersion,
  validateDeploymentConfigForBuild,
  verifyContentSecurityPolicy,
} from "../deployment-config";

const productionApiUrl = "https://api.zoption.site";
const previewApiUrl = "https://budget-expense-api-preview.dondon3109.workers.dev";
const supabaseUrl = "https://project-ref.supabase.co";
const publishableKey = "sb_publishable_public-test-key";

describe("application release version", () => {
  it("uses the semantic-release version when supplied", () => {
    expect(resolveAppVersion("2.2.1", "2.3.0")).toBe("2.3.0");
  });

  it("falls back to the package baseline and rejects invalid versions", () => {
    expect(resolveAppVersion("2.2.1")).toBe("2.2.1");
    expect(() => resolveAppVersion("2.2.1", "next")).toThrow("major.minor.patch");
  });
});

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
    expect(policy).toContain("connect-src");
    expect(policy).toContain("https://downloads.zoption.site");
    expect(policy).toContain("media-src 'self' blob:");
    expect(policy).not.toContain("*.supabase.co");
    expect(policy).not.toContain("*.workers.dev");
    expect(() => verifyContentSecurityPolicy(headers, policy)).not.toThrow();
  });

  it("allows microphone capture only in voice-enabled deployment headers", () => {
    const template = "/*\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n";
    expect(addAssistantVoiceMicrophonePermission(template, "production")).toContain(
      "microphone=(self)",
    );
    expect(addAssistantVoiceMicrophonePermission(template, "preview")).toContain(
      "microphone=(self)",
    );
    expect(addAssistantVoiceMicrophonePermission(template, "staging")).toContain("microphone=()");
    expect(() => addAssistantVoiceMicrophonePermission("/*\n", "preview")).toThrow(
      "disable microphone access",
    );
  });

  it("allows blob audio only in voice-enabled deployment CSPs", () => {
    const production = validateDeploymentConfigForBuild(validInput());
    const preview = validateDeploymentConfigForBuild(validInput("preview"));
    const staging = validateDeploymentConfigForBuild(validInput("staging"));
    if (!production || !preview || !staging) throw new Error("Expected deployment configs.");
    expect(createContentSecurityPolicy(production)).toContain("media-src 'self' blob:");
    expect(createContentSecurityPolicy(preview)).toContain("media-src 'self' blob:");
    expect(createContentSecurityPolicy(staging)).not.toContain("media-src");
  });

  it("allows PostHog connect-src origin only when the deployment enables PostHog", () => {
    const withoutPostHog = validateDeploymentConfigForBuild(validInput());
    const withPostHog = validateDeploymentConfigForBuild({
      ...validInput(),
      posthogKey: "phc_test_public_key",
    });
    const withCustomPostHogHost = validateDeploymentConfigForBuild({
      ...validInput(),
      posthogKey: "phc_test_public_key",
      posthogHost: "https://eu.i.posthog.com",
    });
    if (!withoutPostHog || !withPostHog || !withCustomPostHogHost) {
      throw new Error("Expected deployment configs.");
    }

    expect(createContentSecurityPolicy(withoutPostHog)).not.toContain("posthog.com");
    expect(createContentSecurityPolicy(withoutPostHog)).not.toContain("googletagmanager.com");
    expect(createContentSecurityPolicy(withoutPostHog)).not.toContain("cloudflareinsights.com");

    const posthogPolicy = createContentSecurityPolicy(withPostHog);
    expect(posthogPolicy).toContain("https://us.i.posthog.com");
    expect(posthogPolicy).not.toContain("*.posthog.com");
    expect(posthogPolicy).toContain("script-src 'self'");

    const customHostPolicy = createContentSecurityPolicy(withCustomPostHogHost);
    expect(customHostPolicy).toContain("https://eu.i.posthog.com");
    expect(customHostPolicy).not.toContain("https://us.i.posthog.com");

    expect(() =>
      validateDeploymentConfigForBuild({
        ...validInput(),
        posthogKey: "phc_test_public_key",
        posthogHost: "http://insecure.host.com",
      }),
    ).toThrow("must use HTTPS");
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
