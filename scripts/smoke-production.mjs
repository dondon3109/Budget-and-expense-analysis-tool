/**
 * Read-only checks against a deployed public site, web app, and API. The public
 * site (SITE_URL) must serve indexable, canonical pages and hand every app path
 * to APP_URL; the app must be noindex and built against the expected API and
 * Supabase; the API must be healthy and reject anonymous access.
 */
import { assertPublicStructuredDataGraph } from "../apps/site/scripts/structured-data.mjs";
import {
  assertDeploymentContentSecurityPolicy,
  assertFrontendAssetOrigins,
  fetchFrontendScriptGraph,
  parseContentSecurityPolicy,
} from "./deployment-smoke-helpers.mjs";

const siteUrl = requiredUrl("SITE_URL");
const appUrl = requiredUrl("APP_URL");
const apiUrl = requiredUrl("API_URL");
const expectedSupabaseUrl = requiredUrl("EXPECTED_SUPABASE_URL");
const searchIndexingEnabled = process.env.EXPECT_SEARCH_INDEXING !== "0";
// Production app builds always carry PostHog; Preview builds may omit VITE_POSTHOG_KEY.
const expectedPosthogHost = searchIndexingEnabled
  ? requiredUrl("EXPECTED_POSTHOG_HOST")
  : optionalUrl("EXPECTED_POSTHOG_HOST");
const forbiddenSupabaseOrigins = optionalOrigins("FORBIDDEN_SUPABASE_ORIGINS");
const appOrigin = new URL(appUrl).origin;
const siteOrigin = new URL(siteUrl).origin;
// Canonicals always name production, including on a preview deploy.
const seoOrigin = "https://zoption.site";

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/$/, "");
}

function optionalUrl(name) {
  return process.env[name] ? requiredUrl(name) : undefined;
}

function optionalOrigins(name) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function expectResponse(label, url, init, validate) {
  const response = await fetch(url, init);
  await validate(response);
  console.log(`✓ ${label}`);
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) throw new Error(`${label} did not include ${expected}.`);
}

function assertCount(value, expression, expected, label) {
  const actual = [...value.matchAll(expression)].length;
  if (actual !== expected)
    throw new Error(`${label} expected ${expected} matches but found ${actual}.`);
}

function assertRedirect(response, location, label) {
  if (response.status !== 301 || response.headers.get("location") !== location) {
    throw new Error(
      `${label} returned ${response.status} to ${response.headers.get("location")}, not 301 to ${location}.`,
    );
  }
}

function assertPublicSeoDocument(html, path, canonical, label) {
  const robots = searchIndexingEnabled ? "index,follow" : "noindex,nofollow";
  assertCount(html, /<title\b/gi, 1, `${label} title`);
  assertCount(html, /<meta\b[^>]*\bname="robots"/gi, 1, `${label} robots meta`);
  assertCount(html, /<link\b[^>]*\brel="canonical"/gi, 1, `${label} canonical`);
  assertCount(
    html,
    /<script\b[^>]*\bid="zoption-structured-data"/gi,
    1,
    `${label} structured data`,
  );
  assertIncludes(html, `<link rel="canonical" href="${canonical}"`, label);
  assertIncludes(html, `<meta name="robots" content="${robots}"`, label);

  const structuredData = html.match(
    /<script id="zoption-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!structuredData) throw new Error(`${label} did not contain parseable structured data.`);
  assertPublicStructuredDataGraph(JSON.parse(structuredData), { path, canonical });
}

/** The site runs only its own scripts and talks only to itself, the API, and the APK bucket. */
function assertSiteContentSecurityPolicy(value, label) {
  if (!value?.trim()) throw new Error(`${label} is missing Content-Security-Policy.`);
  const directives = parseContentSecurityPolicy(value);
  const scripts = directives.get("script-src") ?? [];
  if (
    scripts[0] !== "'self'" ||
    scripts.slice(1).some((source) => !source.startsWith("'sha256-"))
  ) {
    throw new Error(`${label} script-src allows more than this origin and hashed inline scripts.`);
  }
  if (!(directives.get("connect-src") ?? []).includes(new URL(apiUrl).origin)) {
    throw new Error(`${label} connect-src is missing the API origin.`);
  }
  if ([...directives.values()].flat().some((source) => source.includes("*"))) {
    throw new Error(`${label} CSP contains a wildcard source.`);
  }
}

function assertNoLegacyAnalytics(html, label) {
  if (/(?:googletagmanager|cloudflareinsights)/i.test(html)) {
    throw new Error(`${label} contained legacy analytics scripts.`);
  }
}

// ---- Public site ----------------------------------------------------------

const publicPages = [
  ["landing page", "/", "Zoption makes your money clear. Decide"],
  ["pricing page", "/pricing", "Clear, honest pricing."],
  ["guide page", "/guides/50-30-20-rule-pesos", "50/30/20"],
  ["terms page", "/terms-of-service", "Terms of Service"],
  ["privacy page", "/privacy-policy", "Privacy Policy"],
  ["cookie page", "/cookie-policy", "Cookie Policy"],
];

for (const [label, path, heading] of publicPages) {
  await expectResponse(label, `${siteUrl}${path}`, undefined, async (response) => {
    if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
    assertSiteContentSecurityPolicy(response.headers.get("content-security-policy"), label);
    if (!searchIndexingEnabled) {
      const robots = response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
      if (!robots.includes("noindex"))
        throw new Error(`${label} was missing preview X-Robots-Tag: noindex.`);
    }
    const html = await response.text();
    assertPublicSeoDocument(html, path, `${seoOrigin}${path === "/" ? "" : path}`, label);
    assertIncludes(html, '<meta property="og:title"', label);
    assertIncludes(html, '<meta name="twitter:card" content="summary_large_image"', label);
    assertIncludes(html, heading, label);
    assertNoLegacyAnalytics(html, label);
    if (path === "/") await fetchFrontendScriptGraph(html, siteUrl);
  });
}

for (const path of ["/terms-of-service", "/privacy-policy", "/cookie-policy"]) {
  await expectResponse(
    `${path} trailing slash redirect`,
    `${siteUrl}${path}/`,
    { redirect: "manual" },
    async (response) => assertRedirect(response, path, `${path}/`),
  );
}

await expectResponse(
  "tracking query canonical",
  `${siteUrl}/privacy-policy?utm_source=smoke`,
  undefined,
  async (response) => {
    if (!response.ok) throw new Error(`Tracking query failed with HTTP ${response.status}.`);
    assertPublicSeoDocument(
      await response.text(),
      "/privacy-policy",
      `${seoOrigin}/privacy-policy`,
      "tracking query canonical",
    );
  },
);

if (searchIndexingEnabled) {
  await expectResponse("SEO sitemap", `${siteUrl}/sitemap.xml`, undefined, async (response) => {
    if (!response.ok) throw new Error(`Sitemap failed with HTTP ${response.status}.`);
    const sitemap = await response.text();
    for (const [, path] of publicPages) {
      assertIncludes(sitemap, `<loc>${seoOrigin}${path === "/" ? "" : path}</loc>`, "Sitemap");
    }
    if (sitemap.includes("/app") || sitemap.includes("/login")) {
      throw new Error("Sitemap includes a private or authentication route.");
    }
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    if (new Set(locations).size !== locations.length)
      throw new Error("Sitemap contains duplicate locations.");
    for (const match of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(match[1])) {
        throw new Error("Sitemap contains a non-ISO lastmod value.");
      }
    }
  });
} else {
  await expectResponse(
    "preview sitemap omission",
    `${siteUrl}/sitemap.xml`,
    undefined,
    async (response) => {
      if (response.status !== 404)
        throw new Error(`Preview sitemap returned HTTP ${response.status} instead of 404.`);
    },
  );
}

await expectResponse("robots rules", `${siteUrl}/robots.txt`, undefined, async (response) => {
  if (!response.ok) throw new Error(`robots.txt failed with HTTP ${response.status}.`);
  const robots = await response.text();
  if (searchIndexingEnabled) {
    assertIncludes(robots, `Sitemap: ${seoOrigin}/sitemap.xml`, "robots.txt");
    assertIncludes(robots, "Content-Signal: search=yes, ai-input=yes, ai-train=no", "robots.txt");
  } else if (robots.includes("Sitemap:")) {
    throw new Error("Preview robots.txt must not advertise a sitemap.");
  }
  if (/^Disallow:/im.test(robots)) {
    throw new Error("robots.txt must not disallow any path on the public site.");
  }
});

await expectResponse("LLM guidance", `${siteUrl}/llms.txt`, undefined, async (response) => {
  if (!response.ok) throw new Error(`llms.txt failed with HTTP ${response.status}.`);
  assertIncludes(await response.text(), `](${seoOrigin}/faq)`, "llms.txt");
});

await expectResponse(
  "social image",
  `${siteUrl}/og/zoption-social.png`,
  undefined,
  async (response) => {
    if (!response.ok) throw new Error(`Social image failed with HTTP ${response.status}.`);
    if (!response.headers.get("content-type")?.startsWith("image/png")) {
      throw new Error("Social image did not return a PNG content type.");
    }
  },
);

await expectResponse(
  "unknown public route",
  `${siteUrl}/this-page-does-not-exist`,
  undefined,
  async (response) => {
    if (response.status !== 404) {
      throw new Error(`Unknown public route returned HTTP ${response.status} instead of 404.`);
    }
    assertIncludes(await response.text(), "That page is not here.", "404 page");
  },
);

// Old app URLs on the site land on the app, sign-in callbacks with their query intact.
for (const [path, location] of [
  ["/login", `${appUrl}/login`],
  ["/auth/callback?code=smoke", `${appUrl}/auth/callback?code=smoke`],
  ["/app/transactions", `${appUrl}/app/transactions`],
  ["/dashboard", `${appUrl}/app`],
]) {
  await expectResponse(
    `site hands ${path} to the app`,
    `${siteUrl}${path}`,
    { redirect: "manual" },
    async (response) => assertRedirect(response, location, `${siteUrl}${path}`),
  );
}

// ---- Web app ----------------------------------------------------------------

for (const path of ["/login", "/auth/callback", "/app/transactions"]) {
  await expectResponse(`app ${path}`, `${appUrl}${path}`, undefined, async (response) => {
    if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}.`);
    const robots = response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
    if (!robots.includes("noindex")) throw new Error(`${path} was missing X-Robots-Tag: noindex.`);
    assertDeploymentContentSecurityPolicy(response.headers.get("content-security-policy"), {
      apiUrl,
      expectedSupabaseUrl,
      expectedPosthogHost,
      forbiddenSupabaseOrigins,
    });
    const html = await response.text();
    assertIncludes(html, '<meta name="robots" content="noindex,nofollow"', path);
    assertNoLegacyAnalytics(html, path);
    if (path === "/login") {
      assertFrontendAssetOrigins(await fetchFrontendScriptGraph(html, appUrl), {
        apiUrl,
        expectedSupabaseUrl,
        forbiddenSupabaseOrigins,
      });
    }
  });
}

await expectResponse(
  "app legacy dashboard redirect",
  `${appUrl}/dashboard`,
  { redirect: "manual" },
  async (response) => assertRedirect(response, "/app", "Legacy dashboard"),
);

await expectResponse(
  "app hands public pages to the site",
  `${appUrl}/pricing`,
  { redirect: "manual" },
  async (response) => assertRedirect(response, `${seoOrigin}/pricing`, "App /pricing"),
);

// ---- API --------------------------------------------------------------------

await expectResponse(
  "API health and D1 readiness",
  `${apiUrl}/health`,
  undefined,
  async (response) => {
    if (!response.ok) throw new Error(`Health check failed with HTTP ${response.status}.`);
    const body = await response.json();
    if (body.status !== "ok") throw new Error("Health response was not ready.");
  },
);

await expectResponse(
  "retired public dashboard",
  `${apiUrl}/api/demo/dashboard?from=2026-07-01&to=2026-07-31`,
  { headers: { Origin: appOrigin } },
  async (response) => {
    if (response.status !== 404) {
      throw new Error(`Retired public dashboard returned HTTP ${response.status} instead of 404.`);
    }
  },
);

await expectResponse(
  "private API rejects anonymous access",
  `${apiUrl}/api/app/dashboard?from=2026-07-01&to=2026-07-31`,
  { headers: { Origin: appOrigin } },
  async (response) => {
    if (response.status !== 401) {
      throw new Error(`Private API returned HTTP ${response.status} instead of 401.`);
    }
    const body = await response.json();
    if (body.error !== "authentication_required") {
      throw new Error("Private API did not return the expected authentication error.");
    }
  },
);

await expectResponse(
  "authenticated CORS preflight from the app",
  `${apiUrl}/api/app/transactions`,
  {
    method: "OPTIONS",
    headers: {
      Origin: appOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  },
  async (response) => {
    if (response.status !== 204) throw new Error(`Preflight failed with HTTP ${response.status}.`);
    const allowed = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
    if (!allowed.includes("authorization") || !allowed.includes("content-type")) {
      throw new Error("Preflight did not allow authenticated JSON requests.");
    }
  },
);

await expectResponse(
  "support chat CORS preflight from the site",
  `${apiUrl}/api/support/chat`,
  {
    method: "OPTIONS",
    headers: {
      Origin: siteOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  },
  async (response) => {
    if (response.status !== 204) throw new Error(`Preflight failed with HTTP ${response.status}.`);
    if (response.headers.get("access-control-allow-origin") !== siteOrigin) {
      throw new Error("The API does not allow the public site to call the support chat.");
    }
  },
);

console.log("Production smoke checks passed without changing financial records.");
