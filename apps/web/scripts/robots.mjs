/**
 * Single source of truth for the generated `robots.txt`.
 *
 * The file in `public/` is never what ships: `prerender.mjs` writes `dist/robots.txt`
 * on every build, and the release workflow deploys `apps/web/dist`. Keeping a second
 * copy in `public/` only creates a place for the two to disagree.
 *
 * AI-crawler policy lives at the Cloudflare edge, not here. Cloudflare prepends its
 * own managed block above this file, so any `Allow` we repeat for an agent that block
 * already `Disallow`s produces two equally specific, conflicting groups. Crawlers
 * resolve that tie unpredictably and generally restrictively, so restating the policy
 * here accomplishes nothing. The wildcard group below already permits those agents the
 * moment the edge stops blocking them — see `docs/seo.md` for the zone setting.
 */
export function robotsText(siteOrigin, indexingEnabled) {
  if (!indexingEnabled) return "User-agent: *\nAllow: /\n";

  return [
    "# AI crawler access is controlled at the Cloudflare edge (Bots > robots.txt).",
    "# This file intentionally does not restate `Allow` rules for agents that the",
    "# Cloudflare managed block already covers: duplicate groups of equal specificity",
    "# conflict, and crawlers resolve that tie against us.",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    "",
  ].join("\n");
}
