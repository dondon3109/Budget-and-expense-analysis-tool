import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(`Prerender verification failed: ${message}`);
}

function count(value, expression) {
  return [...value.matchAll(expression)].length;
}

function outputFileForPath(distDirectory, pathname) {
  if (pathname === "/") return resolve(distDirectory, "index.html");
  return resolve(distDirectory, `${pathname.slice(1)}.html`);
}

function canonicalForPath(origin, pathname) {
  return pathname === "/" ? origin : `${origin}${pathname}`;
}

function expectedRobots(indexingEnabled) {
  return indexingEnabled ? "index,follow" : "noindex,nofollow";
}

function verifyDocument(html, route, options) {
  const { indexingEnabled, structuredDataScriptId } = options;
  const robots = expectedRobots(indexingEnabled);

  assert(!html.includes("<!-- seo-head -->"), `${route.path} retained the SEO marker.`);
  assert(!html.includes("data-zoption-prerender-root></div>"), `${route.path} has an empty root.`);
  assert(count(html, /<h1\b/gi) === 1, `${route.path} must contain exactly one h1.`);
  assert(count(html, /<title\b/gi) === 1, `${route.path} must contain exactly one title.`);
  assert(
    count(html, /<meta\b[^>]*\bid="zoption-description"/gi) === 1,
    `${route.path} must contain one description.`,
  );
  assert(
    count(html, /<meta\b[^>]*\bid="zoption-robots"/gi) === 1,
    `${route.path} must contain one robots meta.`,
  );
  assert(
    count(html, /<link\b[^>]*\brel="canonical"/gi) === 1,
    `${route.path} must contain one canonical.`,
  );
  assert(
    html.includes(`<title id="zoption-title">${route.escapedTitle}</title>`),
    `${route.path} title does not match its route metadata.`,
  );
  assert(
    html.includes(
      `<meta id="zoption-description" name="description" content="${route.escapedDescription}" />`,
    ),
    `${route.path} description does not match its route metadata.`,
  );
  assert(
    html.includes(`<meta id="zoption-robots" name="robots" content="${robots}" />`),
    `${route.path} robots does not match the build environment.`,
  );
  assert(
    html.includes(`<link rel="canonical" href="${route.metadata.canonical}" />`),
    `${route.path} canonical does not match its route metadata.`,
  );

  const scripts = [
    ...html.matchAll(
      new RegExp(
        `<script id="${structuredDataScriptId}" type="application/ld\\+json">([\\s\\S]*?)<\\/script>`,
        "g",
      ),
    ),
  ];
  assert(scripts.length === 1, `${route.path} must contain one managed JSON-LD script.`);
  JSON.parse(scripts[0][1]);
}

function verifyNoindexDocument(html, name, requiresCanonical = true) {
  assert(
    html.includes('<meta id="zoption-robots" name="robots" content="noindex,nofollow" />'),
    `${name} must be noindex.`,
  );
  if (requiresCanonical) {
    assert(
      count(html, /<link\b[^>]*\brel="canonical"/gi) === 1,
      `${name} must contain one canonical.`,
    );
  }
}

export async function verifyPrerenderArtifacts({
  distDirectory,
  indexingEnabled,
  routes,
  siteOrigin,
  structuredDataScriptId,
}) {
  for (const route of routes) {
    const html = await readFile(outputFileForPath(distDirectory, route.path), "utf8");
    verifyDocument(html, route, { indexingEnabled, structuredDataScriptId });
  }

  const spa = await readFile(resolve(distDirectory, "spa.html"), "utf8");
  assert(
    spa.includes('<div id="root" data-zoption-prerender-root></div>'),
    "spa.html must retain an empty application root.",
  );
  verifyNoindexDocument(spa, "spa.html", false);

  const notFound = await readFile(resolve(distDirectory, "404.html"), "utf8");
  assert(
    notFound.includes("That page is not here."),
    "404.html must contain the rendered not-found page.",
  );
  verifyNoindexDocument(notFound, "404.html");

  const redirects = await readFile(resolve(distDirectory, "_redirects"), "utf8");
  for (const path of ["/terms-of-service", "/privacy-policy", "/cookie-policy"]) {
    assert(
      redirects.includes(`${path}/ ${path} 301`),
      `${path} must redirect its trailing-slash variant to the canonical URL.`,
    );
  }

  const headers = await readFile(resolve(distDirectory, "_headers"), "utf8");
  const hasGlobalNoindex = headers.startsWith("/*\n  X-Robots-Tag: noindex, nofollow\n");
  assert(
    hasGlobalNoindex === !indexingEnabled,
    `${indexingEnabled ? "production" : "non-production"} header policy is incorrect.`,
  );
  for (const path of ["/login", "/auth/*", "/app", "/app/*", "/spa.html", "/spa"]) {
    assert(
      headers.includes(`${path}\n  X-Robots-Tag: noindex, nofollow`),
      `${path} must have a noindex header.`,
    );
  }

  const robots = await readFile(resolve(distDirectory, "robots.txt"), "utf8");
  if (indexingEnabled) {
    const sitemap = await readFile(resolve(distDirectory, "sitemap.xml"), "utf8");
    assert(
      robots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`),
      "production robots.txt must advertise the sitemap.",
    );
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expectedLocations = routes.map((route) => canonicalForPath(siteOrigin, route.path));
    assert(
      JSON.stringify(locations) === JSON.stringify(expectedLocations),
      "sitemap routes must match the public route manifest.",
    );
    assert(
      new Set(locations).size === locations.length,
      "sitemap must not contain duplicate locations.",
    );
    for (const lastModified of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(lastModified[1]),
        "sitemap lastmod values must use ISO dates.",
      );
    }
  } else {
    assert(!robots.includes("Sitemap:"), "non-production robots.txt must not advertise a sitemap.");
    await readFile(resolve(distDirectory, "sitemap.xml"), "utf8").then(
      () => {
        throw new Error(
          "Prerender verification failed: non-production output must not publish sitemap.xml.",
        );
      },
      (error) => {
        if (error?.code !== "ENOENT") throw error;
      },
    );
  }
}
