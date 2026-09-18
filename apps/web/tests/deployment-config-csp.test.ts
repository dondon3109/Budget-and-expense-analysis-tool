import { describe, expect, it } from "vitest";

import {
  addContentSecurityPolicy,
  createContentSecurityPolicy,
  validateDeploymentConfigForBuild,
  verifyContentSecurityPolicy,
} from "../deployment-config";

const productionApiUrl = "https://api.zoption.site";
const previewApiUrl = "https://budget-expense-api-preview.dondon3109.workers.dev";
const supabaseUrl = "https://project-ref.supabase.co";
const publishableKey = "sb_publishable_public-test-key";

/**
 * The exact hosts @paypal/paypal-js loads /web-sdk/v6/core from: the live host
 * everywhere, and the sandbox host only outside production. There is deliberately
 * no wildcard: this origin keeps the Supabase refresh token in localStorage, so a
 * compromised PayPal subdomain would be a full account takeover.
 */
const LIVE_SCRIPT_SOURCE = "https://www.paypal.com";
const SANDBOX_SCRIPT_SOURCE = "https://www.sandbox.paypal.com";
const PAYPAL_LIVE_SCRIPT_SOURCES = [LIVE_SCRIPT_SOURCE];
/** Every PayPal source the non-script directives trust, including the asset host. */
const PAYPAL_ALL_SOURCES = [
  LIVE_SCRIPT_SOURCE,
  SANDBOX_SCRIPT_SOURCE,
  "https://www.paypalobjects.com",
];

function deploymentPolicy(deployEnvironment: "production" | "preview" = "production"): string {
  const apiUrl = deployEnvironment === "production" ? productionApiUrl : previewApiUrl;
  const resolved = validateDeploymentConfigForBuild({
    command: "build",
    deployEnvironment,
    effectiveApiUrl: apiUrl,
    explicitApiUrl: apiUrl,
    effectiveSupabaseUrl: supabaseUrl,
    explicitSupabaseUrl: supabaseUrl,
    effectiveSupabasePublishableKey: publishableKey,
    explicitSupabasePublishableKey: publishableKey,
  });
  if (!resolved) throw new Error("Expected a resolved deployment config.");
  return createContentSecurityPolicy(resolved);
}

function directive(policy: string, name: string): string {
  const value = policy.split("; ").find((part) => part.startsWith(`${name} `));
  if (!value) throw new Error(`The policy is missing its ${name} directive.`);
  return value;
}

describe("PayPal script sources", () => {
  it("loads production PayPal code from the live SDK host only", () => {
    const policy = deploymentPolicy();

    expect(directive(policy, "script-src")).toBe(
      `script-src 'self' ${PAYPAL_LIVE_SCRIPT_SOURCES.join(" ")}`,
    );
    expect(directive(policy, "script-src")).not.toContain(SANDBOX_SCRIPT_SOURCE);
    expect(directive(policy, "script-src")).not.toContain("paypalobjects.com");
  });

  it("adds the sandbox SDK host only outside production", () => {
    expect(directive(deploymentPolicy("preview"), "script-src")).toBe(
      `script-src 'self' ${LIVE_SCRIPT_SOURCE} ${SANDBOX_SCRIPT_SOURCE}`,
    );
  });

  it("emits no wildcard source anywhere, in any environment", () => {
    expect(deploymentPolicy()).not.toContain("*");
    expect(directive(deploymentPolicy("preview"), "script-src")).not.toContain("*");
  });

  it("drops venmo, which no mounted component offers as a funding source", () => {
    expect(deploymentPolicy().toLowerCase()).not.toContain("venmo");
  });

  it("keeps the PayPal hosts for frames, styles, images and connections", () => {
    const policy = deploymentPolicy();

    expect(directive(policy, "frame-src")).toBe(`frame-src ${PAYPAL_ALL_SOURCES.join(" ")}`);
    expect(directive(policy, "child-src")).toBe(`child-src ${PAYPAL_ALL_SOURCES.join(" ")}`);
    expect(directive(policy, "style-src")).toBe(
      `style-src 'self' 'unsafe-inline' ${PAYPAL_ALL_SOURCES.join(" ")}`,
    );
    for (const source of PAYPAL_ALL_SOURCES) {
      expect(directive(policy, "img-src")).toContain(source);
      expect(directive(policy, "connect-src")).toContain(source);
    }
  });

  it("keeps the rest of the core policy untouched", () => {
    const policy = deploymentPolicy();

    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "script-src")).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });
});

describe("approved wildcard guard", () => {
  it("accepts the policy the build actually emits", () => {
    const policy = deploymentPolicy();
    const headers = addContentSecurityPolicy("/*\n  X-Frame-Options: DENY\n", policy);

    expect(() => verifyContentSecurityPolicy(headers, policy)).not.toThrow();
  });

  it("rejects a PayPal wildcard, which the source-derived guard used to approve", () => {
    // The guard was built by filtering the same list it checked, so every PayPal
    // wildcard there was pre-approved and this policy passed the build.
    const policy = "script-src 'self' https://*.paypal.com";
    expect(() =>
      verifyContentSecurityPolicy(`/*\n  Content-Security-Policy: ${policy}\n`, policy),
    ).toThrow("contains an unapproved wildcard source");
  });

  it("rejects a wildcard added anywhere else in the policy", () => {
    const policy = "default-src 'self'; connect-src https://*.posthog.com";
    expect(() =>
      verifyContentSecurityPolicy(`/*\n  Content-Security-Policy: ${policy}\n`, policy),
    ).toThrow("contains an unapproved wildcard source");
  });
});
