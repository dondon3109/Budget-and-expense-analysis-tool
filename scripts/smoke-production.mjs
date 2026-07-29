const webUrl = requiredUrl("WEB_URL");
const apiUrl = requiredUrl("API_URL");
const origin = new URL(webUrl).origin;
const seoOrigin = "https://zoption.site";

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/$/, "");
}

async function expectResponse(label, url, init, validate) {
  const response = await fetch(url, init);
  await validate(response);
  console.log(`✓ ${label}`);
}

async function expectFrontendApiUrl(html) {
  const pending = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(
    (match) => new URL(match[1], webUrl).href,
  );
  const visited = new Set();

  while (pending.length > 0) {
    const assetUrl = pending.pop();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Frontend asset failed with HTTP ${response.status}.`);
    const source = await response.text();
    if (source.includes(apiUrl)) return;
    for (const match of source.matchAll(/["']([^"']+\.js)["']/g)) {
      const assetPath = match[1];
      if (!/^(?:\.\/|\/?assets\/)/.test(assetPath)) continue;
      const baseUrl = assetPath.startsWith("./") ? assetUrl : `${webUrl}/`;
      pending.push(new URL(assetPath, baseUrl).href);
    }
  }

  throw new Error("The deployed frontend does not contain the configured API URL.");
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) throw new Error(`${label} did not include ${expected}.`);
}

const apiHeaders = { Origin: origin };
const publicPages = [
  ["landing page", "/", "See where your money goes. Decide what comes next."],
  ["terms page", "/terms-of-service", "Terms of Service"],
  ["privacy page", "/privacy-policy", "Privacy Policy"],
  ["cookie page", "/cookie-policy", "Cookie Policy"],
];

for (const [label, path, heading] of publicPages) {
  await expectResponse(label, `${webUrl}${path}`, undefined, async (response) => {
    if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
    const html = await response.text();
    const canonical = `${seoOrigin}${path === "/" ? "" : path}`;
    assertIncludes(html, `<link rel="canonical" href="${canonical}"`, label);
    assertIncludes(html, '<meta name="robots" content="index,follow"', label);
    assertIncludes(html, '<meta property="og:title"', label);
    assertIncludes(html, '<meta name="twitter:card" content="summary_large_image"', label);
    assertIncludes(html, 'application/ld+json', label);
    assertIncludes(html, heading, label);
    if (html.includes("www.googletagmanager.com/gtag/js")) {
      throw new Error(`${label} loaded Google Analytics before consent.`);
    }

    if (path === "/") await expectFrontendApiUrl(html);
  });
}

await expectResponse("SEO sitemap", `${webUrl}/sitemap.xml`, undefined, async (response) => {
  if (!response.ok) throw new Error(`Sitemap failed with HTTP ${response.status}.`);
  const sitemap = await response.text();
  for (const [, path] of publicPages) {
    assertIncludes(sitemap, `${seoOrigin}${path === "/" ? "/" : path}`, "Sitemap");
  }
  if (sitemap.includes("/app") || sitemap.includes("/login")) {
    throw new Error("Sitemap includes a private or authentication route.");
  }
});

await expectResponse("robots rules", `${webUrl}/robots.txt`, undefined, async (response) => {
  if (!response.ok) throw new Error(`robots.txt failed with HTTP ${response.status}.`);
  assertIncludes(await response.text(), `Sitemap: ${seoOrigin}/sitemap.xml`, "robots.txt");
});

await expectResponse("LLM guidance", `${webUrl}/llms.txt`, undefined, async (response) => {
  if (!response.ok) throw new Error(`llms.txt failed with HTTP ${response.status}.`);
  assertIncludes(await response.text(), "Zoption", "llms.txt");
});

await expectResponse("social image", `${webUrl}/og/zoption-social.png`, undefined, async (response) => {
  if (!response.ok) throw new Error(`Social image failed with HTTP ${response.status}.`);
  if (!response.headers.get("content-type")?.startsWith("image/png")) {
    throw new Error("Social image did not return a PNG content type.");
  }
});

for (const path of ["/login", "/auth/callback", "/app/transactions"]) {
  await expectResponse(`noindex ${path}`, `${webUrl}${path}`, undefined, async (response) => {
    if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}.`);
    const robots = response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
    if (!robots.includes("noindex")) throw new Error(`${path} was missing X-Robots-Tag: noindex.`);
    assertIncludes(await response.text(), 'name="robots" content="noindex,nofollow"', path);
  });
}

await expectResponse("legacy dashboard redirect", `${webUrl}/dashboard`, { redirect: "manual" }, async (response) => {
  if (response.status !== 301 || response.headers.get("location") !== "/app") {
    throw new Error("Legacy dashboard did not permanently redirect to /app.");
  }
});

await expectResponse("unknown public route", `${webUrl}/this-page-does-not-exist`, undefined, async (response) => {
  if (response.status !== 404) {
    throw new Error(`Unknown public route returned HTTP ${response.status} instead of 404.`);
  }
  assertIncludes(await response.text(), "That page is not here.", "404 page");
});

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
