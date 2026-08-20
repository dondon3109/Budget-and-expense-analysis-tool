import { describe, expect, it, vi } from "vitest";

import {
  assertDeploymentContentSecurityPolicy,
  assertFrontendAssetOrigins,
  fetchFrontendScriptGraph,
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

  it("walks the deployed JavaScript graph and rejects a missing lazy chunk", async () => {
    const webUrl = "https://zoption.site";
    const html = '<script type="module" src="/assets/index-new.js"></script>';
    const fetchImpl = vi.fn(async (url) => {
      if (url === `${webUrl}/assets/index-new.js`) {
        return new Response('const lazy="/assets/lazy-new.js"', { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    await expect(fetchFrontendScriptGraph(html, webUrl, fetchImpl)).rejects.toThrow(
      `Frontend asset ${webUrl}/assets/lazy-new.js failed with HTTP 404.`,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns the source of every available deployed JavaScript chunk", async () => {
    const webUrl = "https://zoption.site";
    const html = '<script type="module" src="/assets/index-new.js"></script>';
    const fetchImpl = vi.fn(async (url) => {
      if (url === `${webUrl}/assets/index-new.js`) {
        return new Response('const lazy="/assets/lazy-new.js"', { status: 200 });
      }
      return new Response("const ready=true", { status: 200 });
    });

    await expect(fetchFrontendScriptGraph(html, webUrl, fetchImpl)).resolves.toEqual([
      'const lazy="/assets/lazy-new.js"',
      "const ready=true",
    ]);
  });
});
