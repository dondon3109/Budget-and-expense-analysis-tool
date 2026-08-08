import { describe, expect, it } from "vitest";

import {
  assertDeploymentContentSecurityPolicy,
  assertFrontendAssetOrigins,
} from "./deployment-smoke-helpers.mjs";

const apiUrl = "https://api.preview.example.com";
const expectedSupabaseUrl = "https://preview-ref.supabase.co";
const forbiddenSupabaseUrl = "https://production-ref.supabase.co";
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  `img-src 'self' data: blob: ${expectedSupabaseUrl}`,
  `connect-src 'self' ${expectedSupabaseUrl} ${apiUrl}`,
  "object-src 'none'",
].join("; ");

describe("deployment smoke origin checks", () => {
  it("accepts an exact environment-specific API and Supabase CSP", () => {
    expect(() =>
      assertDeploymentContentSecurityPolicy(csp, {
        apiUrl,
        expectedSupabaseUrl,
        forbiddenSupabaseOrigins: [forbiddenSupabaseUrl],
      }),
    ).not.toThrow();
  });

  it.each([
    csp.replace(expectedSupabaseUrl, forbiddenSupabaseUrl),
    `${csp}; connect-src https://*.supabase.co`,
    csp.replace(apiUrl, `${apiUrl} https://*.google-analytics.com`),
    csp.replace(apiUrl, "https://another-api.example.com"),
  ])("rejects an unexpected or broad deployed CSP", (invalidCsp) => {
    expect(() =>
      assertDeploymentContentSecurityPolicy(invalidCsp, {
        apiUrl,
        expectedSupabaseUrl,
        forbiddenSupabaseOrigins: [forbiddenSupabaseUrl],
      }),
    ).toThrow();
  });

  it("verifies expected and forbidden origins in frontend assets", () => {
    expect(() =>
      assertFrontendAssetOrigins([`const api='${apiUrl}'`, `const auth='${expectedSupabaseUrl}'`], {
        apiUrl,
        expectedSupabaseUrl,
        forbiddenSupabaseOrigins: [forbiddenSupabaseUrl],
      }),
    ).not.toThrow();
    expect(() =>
      assertFrontendAssetOrigins(
        [`const api='${apiUrl}'`, `const auth='${forbiddenSupabaseUrl}'`],
        {
          apiUrl,
          expectedSupabaseUrl,
          forbiddenSupabaseOrigins: [forbiddenSupabaseUrl],
        },
      ),
    ).toThrow("expected Supabase origin");
  });
});
