import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyPrerenderArtifacts } from "./verify-prerender.mjs";

const webRoot = resolve(import.meta.dirname, "..");
const distDirectory = resolve(webRoot, "dist");
const serverEntry = resolve(webRoot, "dist-ssr", "entry-server.js");
const deployEnvironments = new Set(["production", "preview", "staging"]);

function resolveDeployEnvironment() {
  const deployEnvironment = process.env.ZOPTION_DEPLOY_ENV;
  if (!deployEnvironment) {
    if (process.env.CF_PAGES === "1") {
      throw new Error("ZOPTION_DEPLOY_ENV is required for Cloudflare Pages builds.");
    }
    return "production";
  }

  if (!deployEnvironments.has(deployEnvironment)) {
    throw new Error(
      `ZOPTION_DEPLOY_ENV must be one of: ${[...deployEnvironments].join(", ")}. Received: ${deployEnvironment}.`,
    );
  }

  return deployEnvironment;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function replaceExactlyOnce(value, target, replacement, label) {
  const occurrences = value.split(target).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${label} marker, found ${occurrences}.`);
  }
  return value.replace(target, replacement);
}

function metadataHead(
  metadata,
  { siteName, socialImageUrl, structuredDataScriptId, serializeJsonLd },
) {
  const tags = [
    `<link rel="canonical" href="${metadata.canonical}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${metadata.canonical}" />`,
    `<meta property="og:image" content="${socialImageUrl}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Zoption private budget and expense tracker" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${socialImageUrl}" />`,
    '<meta name="twitter:image:alt" content="Zoption private budget and expense tracker" />',
  ];

  if (metadata.structuredData) {
    tags.push(
      `<script id="${structuredDataScriptId}" type="application/ld+json">${serializeJsonLd(metadata.structuredData)}</script>`,
    );
  }

  return tags.join("\n    ");
}

function renderDocument(template, appHtml, metadata, context) {
  const head = metadataHead(metadata, context);
  let document = replaceExactlyOnce(template, "<!-- seo-head -->", head, "SEO head");
  document = replaceExactlyOnce(
    document,
    `<meta\n      id="zoption-description"\n      name="description"\n      content="${context.defaultDescription}"\n    />`,
    `<meta id="zoption-description" name="description" content="${escapeHtml(metadata.description)}" />`,
    "description",
  );
  document = replaceExactlyOnce(
    document,
    '<meta id="zoption-robots" name="robots" content="noindex,nofollow" />',
    `<meta id="zoption-robots" name="robots" content="${metadata.robots}" />`,
    "robots",
  );
  document = replaceExactlyOnce(
    document,
    '<title id="zoption-title">Zoption — Budget and expense analysis</title>',
    `<title id="zoption-title">${escapeHtml(metadata.title)}</title>`,
    "title",
  );
  return replaceExactlyOnce(
    document,
    '<div id="root" data-zoption-prerender-root></div>',
    `<div id="root" data-zoption-prerender-root>${appHtml}</div>`,
    "application root",
  );
}

function sitemapXml(entries, siteOrigin) {
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${siteOrigin}${entry.path === "/" ? "" : entry.path}</loc>\n    <lastmod>${entry.lastModified}</lastmod>\n    <changefreq>${entry.changeFrequency}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robotsText(siteOrigin, indexingEnabled) {
  if (!indexingEnabled) return "User-agent: *\nAllow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`;
}

function previewHeaders(headers) {
  if (!headers.startsWith("/*\n")) {
    throw new Error("Expected the global headers rule to be the first _headers rule.");
  }
  return headers.replace("/*\n", "/*\n  X-Robots-Tag: noindex, nofollow\n");
}

async function readDeploymentManifest(deployEnvironment) {
  const path = resolve(distDirectory, ".zoption-deployment.json");
  const payload = JSON.parse(await readFile(path, "utf8"));
  if (
    typeof payload !== "object" ||
    payload === null ||
    payload.deployEnvironment !== deployEnvironment ||
    typeof payload.apiOrigin !== "string" ||
    typeof payload.supabaseOrigin !== "string" ||
    typeof payload.contentSecurityPolicy !== "string"
  ) {
    throw new Error(
      "The client build deployment manifest is missing or does not match this build.",
    );
  }
  return payload;
}

function outputFileForPath(pathname) {
  if (pathname === "/") return resolve(distDirectory, "index.html");
  return resolve(distDirectory, `${pathname.slice(1)}.html`);
}

async function main() {
  const deployEnvironment = resolveDeployEnvironment();
  const indexingEnabled = deployEnvironment === "production";
  const deploymentManifest = await readDeploymentManifest(deployEnvironment);
  const {
    renderNotFoundPage,
    renderPublicRoute,
    SITEMAP_ENTRIES,
    serializeJsonLd,
    SITE_NAME,
    SITE_ORIGIN,
    SOCIAL_IMAGE_URL,
    STRUCTURED_DATA_SCRIPT_ID,
  } = await import(pathToFileURL(serverEntry).href);
  const template = await readFile(resolve(distDirectory, "index.html"), "utf8");
  const defaultDescription =
    "A clear, privacy-conscious workspace for understanding expenses, budgets, and monthly cash flow.";
  const context = {
    defaultDescription,
    serializeJsonLd,
    siteName: SITE_NAME,
    socialImageUrl: SOCIAL_IMAGE_URL,
    structuredDataScriptId: STRUCTURED_DATA_SCRIPT_ID,
  };

  await copyFile(resolve(distDirectory, "index.html"), resolve(distDirectory, "spa.html"));

  const routes = [];
  for (const entry of SITEMAP_ENTRIES) {
    const { html, metadata } = renderPublicRoute(entry.path);
    const outputFile = outputFileForPath(entry.path);
    await mkdir(resolve(outputFile, ".."), { recursive: true });
    await writeFile(outputFile, renderDocument(template, html, metadata, context));
    routes.push({
      path: entry.path,
      metadata,
      escapedTitle: escapeHtml(metadata.title),
      escapedDescription: escapeHtml(metadata.description),
    });
  }

  const notFoundMetadata = {
    title: "Page not found — Zoption",
    description: "The requested Zoption page could not be found.",
    canonical: `${SITE_ORIGIN}/404`,
    robots: "noindex,nofollow",
  };
  await writeFile(
    resolve(distDirectory, "404.html"),
    renderDocument(template, renderNotFoundPage(), notFoundMetadata, context),
  );

  const headers = await readFile(resolve(distDirectory, "_headers"), "utf8");
  await writeFile(
    resolve(distDirectory, "_headers"),
    indexingEnabled ? headers : previewHeaders(headers),
  );
  await writeFile(resolve(distDirectory, "robots.txt"), robotsText(SITE_ORIGIN, indexingEnabled));

  if (indexingEnabled) {
    await writeFile(
      resolve(distDirectory, "sitemap.xml"),
      sitemapXml(SITEMAP_ENTRIES, SITE_ORIGIN),
    );
  } else {
    await rm(resolve(distDirectory, "sitemap.xml"), { force: true });
  }

  await verifyPrerenderArtifacts({
    distDirectory,
    indexingEnabled,
    routes,
    siteOrigin: SITE_ORIGIN,
    structuredDataScriptId: STRUCTURED_DATA_SCRIPT_ID,
    expectedContentSecurityPolicy: deploymentManifest.contentSecurityPolicy,
    expectedApiOrigin: deploymentManifest.apiOrigin,
    expectedSupabaseOrigin: deploymentManifest.supabaseOrigin,
  });
}

try {
  await main();
} finally {
  await Promise.all([
    rm(resolve(webRoot, "dist-ssr"), { recursive: true, force: true }),
    rm(resolve(distDirectory, ".zoption-deployment.json"), { force: true }),
  ]);
}
