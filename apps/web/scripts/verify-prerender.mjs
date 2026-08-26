import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import release from "../src/releases/androidRelease.json" with { type: "json" };

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

async function sourceMapFiles(directory) {
  const maps = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) maps.push(...(await sourceMapFiles(path)));
    else if (entry.name.endsWith(".map")) maps.push(path);
  }
  return maps;
}

function canonicalForPath(origin, pathname) {
  return pathname === "/" ? origin : `${origin}${pathname}`;
}

function expectedRobots(indexingEnabled) {
  return indexingEnabled ? "index,follow" : "noindex,nofollow";
}

const FORBIDDEN_SCHEMA_TYPES = new Set([
  "Organization",
  "Person",
  "Offer",
  "AggregateRating",
  "Review",
  "BreadcrumbList",
  "LocalBusiness",
  "SearchAction",
]);
const FORBIDDEN_SCHEMA_PROPERTIES = new Set([
  "sameAs",
  "screenshot",
  "softwareVersion",
  "price",
  "priceCurrency",
  "aggregateRating",
  "review",
  "offers",
]);

function structuredDataAssert(condition, message) {
  if (!condition) throw new Error(`Structured data verification failed: ${message}`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectNestedIds(value, ids) {
  if (Array.isArray(value)) {
    for (const item of value) collectNestedIds(item, ids);
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value["@id"] === "string") ids.add(value["@id"]);
  for (const nestedValue of Object.values(value)) collectNestedIds(nestedValue, ids);
}

function rejectUnsupportedSchemaClaims(value, { allowAndroidSoftwareApplication = false } = {}) {
  if (Array.isArray(value)) {
    for (const item of value) {
      rejectUnsupportedSchemaClaims(item, { allowAndroidSoftwareApplication });
    }
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nestedValue] of Object.entries(value)) {
    structuredDataAssert(
      !FORBIDDEN_SCHEMA_PROPERTIES.has(key) ||
        (allowAndroidSoftwareApplication && key === "softwareVersion"),
      `must not include unsupported ${key} markup.`,
    );
    if (key === "@type") {
      const types = Array.isArray(nestedValue) ? nestedValue : [nestedValue];
      for (const type of types) {
        structuredDataAssert(
          typeof type !== "string" || !FORBIDDEN_SCHEMA_TYPES.has(type),
          `must not include unsupported ${type} markup.`,
        );
        structuredDataAssert(
          allowAndroidSoftwareApplication || type !== "SoftwareApplication",
          "must not include unsupported SoftwareApplication markup.",
        );
      }
    }
    rejectUnsupportedSchemaClaims(nestedValue, { allowAndroidSoftwareApplication });
  }
}

export function assertPublicStructuredDataGraph(
  structuredData,
  { path, canonical, dateModified, expectedStructuredData },
) {
  structuredDataAssert(isRecord(structuredData), `${path} must contain a graph object.`);
  structuredDataAssert(
    structuredData["@context"] === "https://schema.org",
    `${path} must use the Schema.org context.`,
  );
  structuredDataAssert(
    Array.isArray(structuredData["@graph"]) && structuredData["@graph"].length > 0,
    `${path} must contain a non-empty graph.`,
  );
  if (expectedStructuredData) {
    structuredDataAssert(
      JSON.stringify(structuredData) === JSON.stringify(expectedStructuredData),
      `${path} graph does not match its route metadata.`,
    );
  }

  const nodes = structuredData["@graph"];
  structuredDataAssert(nodes.every(isRecord), `${path} graph must contain only object nodes.`);
  const nodeIds = nodes.map((node) => node["@id"]);
  structuredDataAssert(
    nodeIds.every((id) => typeof id === "string" && id.length > 0),
    `${path} graph nodes must have stable IDs.`,
  );
  structuredDataAssert(
    new Set(nodeIds).size === nodeIds.length,
    `${path} graph nodes must not duplicate IDs.`,
  );

  const references = new Set();
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key !== "@id") collectNestedIds(value, references);
    }
  }
  for (const reference of references) {
    structuredDataAssert(nodeIds.includes(reference), `${path} has an unresolved ${reference} ID.`);
  }

  rejectUnsupportedSchemaClaims(structuredData, {
    allowAndroidSoftwareApplication: path === "/install",
  });

  const siteOrigin = new URL(canonical).origin;
  const websiteId = `${siteOrigin}/#website`;
  const websiteNodes = nodes.filter((node) => node["@type"] === "WebSite");
  structuredDataAssert(websiteNodes.length === 1, `${path} must contain one WebSite node.`);
  structuredDataAssert(
    websiteNodes[0]["@id"] === websiteId && websiteNodes[0].url === siteOrigin,
    `${path} WebSite node must use the canonical website ID and URL.`,
  );
  structuredDataAssert(
    websiteNodes[0].inLanguage === "en",
    `${path} WebSite node must declare English content.`,
  );

  if (path === "/") {
    const applications = nodes.filter((node) => node["@type"] === "WebApplication");
    structuredDataAssert(
      applications.length === 1,
      "Homepage must contain one WebApplication node.",
    );
    const application = applications[0];
    structuredDataAssert(
      application["@id"] === `${siteOrigin}/#webapplication` && application.url === canonical,
      "Homepage WebApplication must use its canonical ID and URL.",
    );
    structuredDataAssert(
      application.inLanguage === "en" && application.isPartOf?.["@id"] === websiteId,
      "Homepage WebApplication must be English and link to the WebSite.",
    );
    structuredDataAssert(
      Array.isArray(application.featureList) && application.featureList.length === 4,
      "Homepage WebApplication must describe the four visible feature claims.",
    );
    return;
  }

  const pages = nodes.filter((node) => node["@type"] === "WebPage");
  structuredDataAssert(pages.length === 1, `${path} must contain one WebPage node.`);
  const page = pages[0];
  structuredDataAssert(
    page["@id"] === `${canonical}#webpage` && page.url === canonical,
    `${path} WebPage must use its canonical ID and URL.`,
  );
  structuredDataAssert(
    page.inLanguage === "en" && page.isPartOf?.["@id"] === websiteId,
    `${path} WebPage must be English and link to the WebSite.`,
  );
  structuredDataAssert(
    dateModified
      ? page.dateModified === dateModified
      : typeof page.dateModified === "string" && /^\d{4}-\d{2}-\d{2}$/.test(page.dateModified),
    `${path} WebPage dateModified must match its maintained content date.`,
  );

  const softwareApplications = nodes.filter((node) => node["@type"] === "SoftwareApplication");
  if (path === "/install") {
    structuredDataAssert(
      softwareApplications.length === 1,
      "/install must contain one SoftwareApplication node.",
    );
    const application = softwareApplications[0];
    structuredDataAssert(
      page.mainEntity?.["@id"] === application["@id"],
      "/install WebPage must identify the Android application as its main entity.",
    );
    structuredDataAssert(
      typeof application.operatingSystem === "string" &&
        application.operatingSystem.startsWith("Android") &&
        typeof application.softwareVersion === "string" &&
        /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(application.softwareVersion) &&
        typeof application.downloadUrl === "string" &&
        application.downloadUrl === release.downloadPath &&
        application.downloadUrl.endsWith(`/${release.filename}`) &&
        typeof application.fileSize === "string" &&
        /^\d+ bytes$/.test(application.fileSize),
      "/install SoftwareApplication must match the maintained Android release.",
    );
  } else {
    structuredDataAssert(
      softwareApplications.length === 0,
      `${path} must not include SoftwareApplication markup.`,
    );
  }
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
  const structuredData = JSON.parse(scripts[0][1]);
  assertPublicStructuredDataGraph(structuredData, {
    path: route.path,
    canonical: route.metadata.canonical,
    dateModified: route.metadata.sitemap.lastModified,
    expectedStructuredData: route.metadata.structuredData,
  });
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
  expectedContentSecurityPolicy,
  expectedApiOrigin,
  expectedSupabaseOrigin,
}) {
  assert(
    (await sourceMapFiles(distDirectory)).length === 0,
    "production output must not contain source map files.",
  );

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
  for (const path of [
    "/terms-of-service",
    "/privacy-policy",
    "/cookie-policy",
    "/faq",
    "/install",
    "/changelog",
  ]) {
    assert(
      redirects.includes(`${path}/ ${path} 301`),
      `${path} must redirect its trailing-slash variant to the canonical URL.`,
    );
  }

  const headers = await readFile(resolve(distDirectory, "_headers"), "utf8");
  const cspValues = [...headers.matchAll(/^\s*Content-Security-Policy:\s*(.+)$/gim)].map((match) =>
    match[1]?.trim(),
  );
  assert(
    cspValues.length === 1 && cspValues[0] === expectedContentSecurityPolicy,
    "_headers must contain exactly the CSP generated from this build environment.",
  );
  assert(
    expectedContentSecurityPolicy.includes(expectedApiOrigin) &&
      expectedContentSecurityPolicy.includes(expectedSupabaseOrigin),
    "CSP must include the exact API and Supabase origins for this build.",
  );
  assert(
    !expectedContentSecurityPolicy.split(/[;\s]+/).some((source) => source.includes("*")),
    "CSP must use exact origins and must not contain wildcard sources.",
  );
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
