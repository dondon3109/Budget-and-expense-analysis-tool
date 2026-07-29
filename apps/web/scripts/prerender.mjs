import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const webRoot = resolve(import.meta.dirname, "..");
const distDirectory = resolve(webRoot, "dist");
const serverEntry = resolve(webRoot, "dist-ssr", "entry-server.js");
const defaultDescription =
  "A clear, privacy-conscious workspace for understanding expenses, budgets, and monthly cash flow.";

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function metadataHead(metadata) {
  const socialImage = "https://zoption.site/og/zoption-social.png";
  const tags = [
    `<link rel="canonical" href="${metadata.canonical}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Zoption" />',
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${metadata.canonical}" />`,
    `<meta property="og:image" content="${socialImage}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Zoption private budget and expense tracker" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${socialImage}" />`,
    '<meta name="twitter:image:alt" content="Zoption private budget and expense tracker" />',
  ];

  for (const schema of metadata.structuredData ?? []) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>`);
  }

  return tags.join("\n    ");
}

function renderDocument(template, appHtml, metadata) {
  const head = metadataHead(metadata);
  const withHead = template.includes("<!-- seo-head -->")
    ? template.replace("<!-- seo-head -->", head)
    : template.replace("</head>", `    ${head}\n  </head>`);

  return withHead
    .replace(
      `<meta\n      name="description"\n      content="${defaultDescription}"\n    />`,
      `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    )
    .replace('<meta name="robots" content="noindex,nofollow" />', `<meta name="robots" content="${metadata.robots}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
}

function sitemapXml(entries) {
  const urls = entries
    .map(
      (entry) => `  <url>\n    <loc>https://zoption.site${entry.path}</loc>\n    <lastmod>${entry.lastModified}</lastmod>\n    <changefreq>${entry.changeFrequency}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function outputFileForPath(pathname) {
  if (pathname === "/") return resolve(distDirectory, "index.html");
  return resolve(distDirectory, pathname.slice(1), "index.html");
}

async function main() {
  const { renderNotFoundPage, renderPublicRoute, SITEMAP_ENTRIES } = await import(
    pathToFileURL(serverEntry).href,
  );
  const template = await readFile(resolve(distDirectory, "index.html"), "utf8");

  await copyFile(resolve(distDirectory, "index.html"), resolve(distDirectory, "spa.html"));

  for (const entry of SITEMAP_ENTRIES) {
    const { html, metadata } = renderPublicRoute(entry.path);
    const outputFile = outputFileForPath(entry.path);
    await mkdir(resolve(outputFile, ".."), { recursive: true });
    await writeFile(outputFile, renderDocument(template, html, metadata));
  }

  const notFoundMetadata = {
    title: "Page not found — Zoption",
    description: "The requested Zoption page could not be found.",
    canonical: "https://zoption.site/404",
    robots: "noindex,nofollow",
  };
  await writeFile(
    resolve(distDirectory, "404.html"),
    renderDocument(template, renderNotFoundPage(), notFoundMetadata),
  );
  await writeFile(resolve(distDirectory, "sitemap.xml"), sitemapXml(SITEMAP_ENTRIES));
}

try {
  await main();
} finally {
  await rm(resolve(webRoot, "dist-ssr"), { recursive: true, force: true });
}
