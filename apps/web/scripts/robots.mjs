/**
 * Single source of truth for the generated `robots.txt`.
 *
 * The file in `public/` is never what ships: `prerender.mjs` writes `dist/robots.txt`
 * on every build, and the release workflow deploys `apps/web/dist`. Keeping a second
 * copy in `public/` only creates a place for the two to disagree.
 *
 * One wildcard group allows every crawler, AI search agents included. Cloudflare's
 * _Manage your robots.txt_ must stay off for the zone: when on, it prepends a block that
 * disallows GPTBot, ClaudeBot, and others, and no origin rule can override it.
 *
 * `Content-Signal` (Cloudflare's content signals policy) states the intent that
 * replaced that block: search indexing and AI answers grounded in these pages are
 * welcome, model training is not. Crawlers that do not know the line ignore it.
 * See `docs/seo.md`.
 */
export function robotsText(siteOrigin, indexingEnabled) {
  if (!indexingEnabled) return "User-agent: *\nAllow: /\n";

  return [
    "User-agent: *",
    "Allow: /",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "",
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    "",
  ].join("\n");
}
