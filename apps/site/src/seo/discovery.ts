/**
 * The machine-readable files crawlers and AI agents read, all derived from the
 * route manifest so none of them can drift from the pages that exist.
 */
import {
  getPublicRouteMetadata,
  PUBLIC_ROUTE_PATHS,
  SITE_ORIGIN,
  SITEMAP_ENTRIES,
} from "./siteMetadata";

export function sitemapXml(): string {
  const urls = SITEMAP_ENTRIES.map(
    (entry) =>
      `  <url>\n    <loc>${SITE_ORIGIN}${entry.path === "/" ? "" : entry.path}</loc>\n    <lastmod>${entry.lastModified}</lastmod>\n    <changefreq>${entry.changeFrequency}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * One wildcard group allows every crawler, AI search agents included.
 * Cloudflare's _Manage your robots.txt_ must stay off for the zone: when on,
 * it prepends a block that disallows GPTBot, ClaudeBot, and others, and no
 * origin file can override it (docs/seo.md). `Content-Signal` states the
 * intent: search and AI answers grounded in these pages yes, training no.
 */
export function robotsText(indexingEnabled: boolean): string {
  if (!indexingEnabled) return "User-agent: *\nAllow: /\n";
  return [
    "User-agent: *",
    "Allow: /",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

export const LLMS_PAGES_MARKER = "{{public-pages}}";

export function llmsPageList(): string {
  return PUBLIC_ROUTE_PATHS.map((path) => {
    const metadata = getPublicRouteMetadata(path);
    if (!metadata) throw new Error(`Missing metadata for public route: ${path}`);
    const name = metadata.title.replace(/\s*[—|]\s*Zoption$/, "");
    return `- [${name}](${metadata.canonical}): ${metadata.description}`;
  }).join("\n");
}

/** Fills the one page-list marker in a hand-written llms template. */
export function withLlmsPageList(template: string): string {
  const occurrences = template.split(LLMS_PAGES_MARKER).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${LLMS_PAGES_MARKER} marker, found ${occurrences}.`);
  }
  return template.replace(LLMS_PAGES_MARKER, llmsPageList());
}
