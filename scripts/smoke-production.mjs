import { assertPublicStructuredDataGraph } from "../apps/web/scripts/verify-prerender.mjs";
import {
  assertDeploymentContentSecurityPolicy,
  assertFrontendAssetOrigins,
} from "./deployment-smoke-helpers.mjs";

const webUrl = requiredUrl("WEB_URL");
const apiUrl = requiredUrl("API_URL");
const expectedSupabaseUrl = requiredUrl("EXPECTED_SUPABASE_URL");
const forbiddenSupabaseOrigins = optionalOrigins("FORBIDDEN_SUPABASE_ORIGINS");
const origin = new URL(webUrl).origin;
const seoOrigin = "https://zoption.site";
const searchIndexingEnabled = process.env.EXPECT_SEARCH_INDEXING !== "0";

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/$/, "");
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

async function expectFrontendDeploymentOrigins(html) {
  const pending = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(
    (match) => new URL(match[1], webUrl).href,
  );
  const visited = new Set();
  const sources = [];

  while (pending.length > 0) {
    const assetUrl = pending.pop();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Frontend asset failed with HTTP ${response.status}.`);
    const source = await response.text();
    sources.push(source);
    for (const match of source.matchAll(/["']([^"']+\.js)["']/g)) {
      const assetPath = match[1];
      if (!/^(?:\.\/|\/?assets\/)/.test(assetPath)) continue;
      const baseUrl = assetPath.startsWith("./") ? assetUrl : `${webUrl}/`;
      pending.push(new URL(assetPath, baseUrl).href);
    }
  }

  assertFrontendAssetOrigins(sources, {
    apiUrl,
    expectedSupabaseUrl,
    forbiddenSupabaseOrigins,
  });
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) throw new Error(`${label} did not include ${expected}.`);
}

function assertCount(value, expression, expected, label) {
  const actual = [...value.matchAll(expression)].length;
  if (actual !== expected)
    throw new Error(`${label} expected ${expected} matches but found ${actual}.`);
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
  assertIncludes(html, `<meta id="zoption-robots" name="robots" content="${robots}"`, label);

  const structuredData = html.match(
    /<script id="zoption-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!structuredData) throw new Error(`${label} did not contain parseable structured data.`);
  assertPublicStructuredDataGraph(JSON.parse(structuredData), { path, canonical });
}

const apiHeaders = { Origin: origin };
const publicPages = [
  ["landing page", "/", "See where your money goes. Decide"],
  ["terms page", "/terms-of-service", "Terms of Service"],
  ["privacy page", "/privacy-policy", "Privacy Policy"],
  ["cookie page", "/cookie-policy", "Cookie Policy"],
];

for (const [label, path, heading] of publicPages) {
  await expectResponse(label, `${webUrl}${path}`, undefined, async (response) => {
    if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
    assertDeploymentContentSecurityPolicy(response.headers.get("content-security-policy"), {
      apiUrl,
      expectedSupabaseUrl,
      forbiddenSupabaseOrigins,
    });
    const html = await response.text();
    const canonical = `${seoOrigin}${path === "/" ? "" : path}`;
    if (!searchIndexingEnabled) {
      const robots = response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
      if (!robots.includes("noindex"))
        throw new Error(`${label} was missing preview X-Robots-Tag: noindex.`);
    }
    assertPublicSeoDocument(html, path, canonical, label);
    assertIncludes(html, '<meta property="og:title"', label);
    assertIncludes(html, '<meta name="twitter:card" content="summary_large_image"', label);
    assertIncludes(html, heading, label);
    if (html.includes("www.googletagmanager.com/gtag/js")) {
      throw new Error(`${label} loaded Google Analytics before consent.`);
    }

    if (path === "/") await expectFrontendDeploymentOrigins(html);
  });
}

for (const path of ["/terms-of-service", "/privacy-policy", "/cookie-policy"]) {
  await expectResponse(
    `${path} trailing slash redirect`,
    `${webUrl}${path}/`,
    { redirect: "manual" },
    async (response) => {
      if (response.status !== 301 || response.headers.get("location") !== path) {
        throw new Error(`${path}/ did not permanently redirect to its canonical URL.`);
      }
    },
  );
}

await expectResponse(
  "tracking query canonical",
  `${webUrl}/privacy-policy?utm_source=smoke`,
  undefined,
  async (response) => {
    if (!response.ok) throw new Error(`Tracking query failed with HTTP ${response.status}.`);
    const html = await response.text();
    assertPublicSeoDocument(
      html,
      "/privacy-policy",
      `${seoOrigin}/privacy-policy`,
      "tracking query canonical",
    );
  },
);

if (searchIndexingEnabled) {
  await expectResponse("SEO sitemap", `${webUrl}/sitemap.xml`, undefined, async (response) => {
    if (!response.ok) throw new Error(`Sitemap failed with HTTP ${response.status}.`);
    const sitemap = await response.text();
    for (const [, path] of publicPages) {
      assertIncludes(sitemap, `${seoOrigin}${path === "/" ? "/" : path}`, "Sitemap");
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
    `${webUrl}/sitemap.xml`,
    undefined,
    async (response) => {
      if (response.status !== 404)
        throw new Error(`Preview sitemap returned HTTP ${response.status} instead of 404.`);
    },
  );
}

await expectResponse("robots rules", `${webUrl}/robots.txt`, undefined, async (response) => {
  if (!response.ok) throw new Error(`robots.txt failed with HTTP ${response.status}.`);
  const robots = await response.text();
  if (searchIndexingEnabled) {
    assertIncludes(robots, `Sitemap: ${seoOrigin}/sitemap.xml`, "robots.txt");
  } else if (robots.includes("Sitemap:")) {
    throw new Error("Preview robots.txt must not advertise a sitemap.");
  }
  if (/^Disallow:\s*\/app\/?\s*$/im.test(robots)) {
    throw new Error(
      "robots.txt must not block private routes before crawlers can see noindex directives.",
    );
  }
});

await expectResponse("LLM guidance", `${webUrl}/llms.txt`, undefined, async (response) => {
  if (!response.ok) throw new Error(`llms.txt failed with HTTP ${response.status}.`);
  assertIncludes(await response.text(), "Zoption", "llms.txt");
});

await expectResponse(
  "social image",
  `${webUrl}/og/zoption-social.png`,
  undefined,
  async (response) => {
    if (!response.ok) throw new Error(`Social image failed with HTTP ${response.status}.`);
    if (!response.headers.get("content-type")?.startsWith("image/png")) {
      throw new Error("Social image did not return a PNG content type.");
    }
  },
);

for (const path of ["/login", "/auth/callback", "/app/transactions"]) {
  await expectResponse(`noindex ${path}`, `${webUrl}${path}`, undefined, async (response) => {
    if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}.`);
    const robots = response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
    if (!robots.includes("noindex")) throw new Error(`${path} was missing X-Robots-Tag: noindex.`);
    assertIncludes(
      await response.text(),
      'id="zoption-robots" name="robots" content="noindex,nofollow"',
      path,
    );
  });
}

await expectResponse(
  "legacy dashboard redirect",
  `${webUrl}/dashboard`,
  { redirect: "manual" },
  async (response) => {
    if (response.status !== 301 || response.headers.get("location") !== "/app") {
      throw new Error("Legacy dashboard did not permanently redirect to /app.");
    }
  },
);

await expectResponse(
  "unknown public route",
  `${webUrl}/this-page-does-not-exist`,
  undefined,
  async (response) => {
    if (response.status !== 404) {
      throw new Error(`Unknown public route returned HTTP ${response.status} instead of 404.`);
    }
    assertIncludes(await response.text(), "That page is not here.", "404 page");
  },
);

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
  { headers: apiHeaders },
  async (response) => {
    if (response.status !== 404) {
      throw new Error(`Retired public dashboard returned HTTP ${response.status} instead of 404.`);
    }
  },
);

await expectResponse(
  "private API rejects anonymous access",
  `${apiUrl}/api/app/dashboard?from=2026-07-01&to=2026-07-31`,
  { headers: apiHeaders },
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
  "authenticated CORS preflight",
  `${apiUrl}/api/app/transactions`,
  {
    method: "OPTIONS",
    headers: {
      Origin: origin,
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

console.log("Production smoke checks passed without changing financial records.");
