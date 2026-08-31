# SEO

Status notes for organic and AI search on [zoption.site](https://zoption.site).

## Verdict

Zoption's technical SEO is in better shape than most single-page apps. Prerendering
([`apps/web/scripts/prerender.mjs`](../apps/web/scripts/prerender.mjs)) emits real
per-route HTML with canonical URLs, OpenGraph, Twitter cards, and Schema.org graphs,
and `noindex` is applied deliberately to private and parameterized routes.

Technical correctness is not what is holding the site back. Two things are:

1. A Cloudflare configuration is overriding the crawler policy the app declares.
2. The site has **eight indexable URLs, none of which target any search demand.**

## Blocking issue: Cloudflare is overriding the crawler policy

`apps/web/public/robots.txt` explicitly allows AI crawlers. The live file at
`https://zoption.site/robots.txt` does not match it — Cloudflare prepends a managed
block that disallows the same agents:

```text
# BEGIN Cloudflare Managed content
User-agent: Google-Extended
Disallow: /
User-agent: GPTBot
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: Applebot-Extended
Disallow: /
# END Cloudflare Managed Content

User-agent: Google-Extended
Allow: /          <-- app's own block, appended after
User-agent: GPTBot
Allow: /
```

Both groups use identical, equally specific user-agent tokens, so the `Allow` and
`Disallow` on `/` conflict with no defined winner. Crawlers resolve this kind of
tie restrictively, which means **GPTBot, ClaudeBot, Google-Extended, and
Applebot-Extended are most likely being blocked.** (`PerplexityBot` is not in the
Cloudflare block list and remains allowed.)

This contradicts stated intent in three places:

- `apps/web/public/robots.txt` — allows these agents.
- `apps/web/public/llms.txt` — written specifically for AI consumption.
- The FAQ entry and `/faq` structured data telling users to add Zoption as a Google
  Preferred Source.

The `Content-Signal: search=yes,ai-train=no,use=reference` header shows the intent is
to allow AI *search* while refusing AI *training*. Blocking GPTBot and Google-Extended
undermines that.

**Action required (dashboard, not code):** in Cloudflare, open *Bots* → AI crawl
control / managed robots.txt and either turn off AI-crawler blocking or allow these
agents. Then re-fetch the live `robots.txt` and confirm no `Disallow` remains for
GPTBot, ClaudeBot, Google-Extended, or Applebot-Extended.

Nothing in this repository can fix it — the managed block is injected above the origin
file at the edge.

## The real constraint: eight indexable URLs

All eight public routes are product, pricing, or legal pages:

| Route | Type | Search demand targeted |
| --- | --- | --- |
| `/` | product | brand only |
| `/pricing` | product | brand only |
| `/changelog` | product | brand only |
| `/install` | product | brand only |
| `/faq` | support | long-tail only |
| `/terms-of-service` | legal | none |
| `/privacy-policy` | legal | none |
| `/cookie-policy` | legal | none |

There is no informational content, so there is nothing to rank for head terms, and no
internal linking structure to distribute authority.

This shows up in the results: searching the product category returns Pocket Clear,
Peso Buddy, Budget Sheets PH, Pinoy at Work, and several bank-statement converter
sites. **Zoption does not appear at all**, including for its own name.

Meanwhile the features that actually differentiate Zoption are invisible to search:

- BPI, BDO, MariBank, Bank of America, and JPMorgan CSV/XLS/XLSX import presets
- PDF bank statement import
- Receipt-photo and voice entry
- Integer-centavo peso accuracy
- Visual renewal calendar for subscriptions

## Where the demand is

Directional research from August 2026. **No volume figures are given** because no
Ahrefs or Search Console data is connected — see *Getting real data* below. Rankings
are qualitative, based on observed competitor coverage.

### Cluster A — bank and wallet import (best fit)

An entire industry ranks for these terms: `statementedge.com/convert/ph/bdo`,
`bankstatemently.com/banks/ph`, `sheetmybank.com/convert/bdo`,
`bank-statementconverter.com/banks/country/philippines`.

They are one-shot converters: a user converts a statement, then still needs somewhere
to *put* the data. Zoption is a budgeting app that already ships BPI, BDO, and
MariBank presets. That combination is a defensible moat none of them have, and the
terms are far less contested than "budget app".

**Shipped.** An `/import` hub plus one guide per supported institution:

- `/import` — hub covering formats, safety checks, and the no-bank-connection model
- `/import/bdo-statement`, `/import/bpi-statement`, `/import/maribank-statement`
- `/import/bank-of-america-statement`, `/import/jpmorgan-statement`

Each guide is ~600 words and links back to the hub and to its siblings. The column
headings a page advertises are read from `importPresets` in `packages/shared` rather
than written by hand, so the page cannot claim detection the matcher does not
perform; `importGuides.test.ts` fails if a guide names a preset that does not exist.
Add a preset first, then add the guide.

Not built: `/import/csv`, `/import/excel`, `/import/pdf-bank-statement`. Formats are
covered on the hub instead, and standalone pages would compete with the bank pages.

### Cluster B — Philippine budgeting guides

Competitors: `pesobuddy.com/guides/how-to-budget-salary-philippines`,
`budgetsheetsph.com` (50-30-20 with ₱18,000/₱30,000 examples),
`pinoy-at-work.com/budget-calculator`, `pocketclear.app/blog/expense-tracker-philippines`.

Well covered, so differentiate on genuine strengths: peso/centavo accuracy, offline
Android use, no bank connection, e-wallet tracking.

- `/guides/budget-monthly-salary-philippines`
- `/guides/50-30-20-rule-pesos`
- `/guides/track-gcash-maya-spending`

### Cluster C — interactive tools

An interactive 50/30/20 calculator in pesos is the strongest link magnet available
and matches the product's centavo-precision story.

### Cluster D — feature explainers

- `/features/receipt-scanning`, `/features/voice-expense-entry`

Note that `/faq` already carries `FAQPage` markup. Keep it the only page with that
type — `seo-metadata.test.ts` enforces it.

## Guardrails when adding routes

New public routes must be registered in `apps/web/src/seo/siteMetadata.ts`
(`PublicRoutePath`, `PUBLIC_ROUTE_PATHS`, `PUBLIC_ROUTE_METADATA`). Prerendering and
the sitemap derive from that manifest, so a route missing from it is never rendered
or submitted.

`seo-metadata.test.ts` deliberately **rejects** the following, and the test should not
be weakened to accommodate new pages:

- `Organization`, `Person`, `LocalBusiness`, `BreadcrumbList`, `SearchAction`
- `Offer`, `AggregateRating`, `Review`
- `sameAs`, `price`, `priceCurrency`, `screenshot`, `offers`, `aggregateRating`, `review`

The rationale is sound and worth preserving: unregistered products should not assert
business identity, pricing, or ratings they cannot substantiate. That caution is
especially correct for a finance site, which search engines treat as
Your-Money-or-Your-Life and hold to a higher accuracy bar.

## Conventions

**Content dates.** Each route has a `*_LAST_MODIFIED` constant feeding both
`<lastmod>` and `WebPage.dateModified`. Update it whenever the page's copy changes;
the two must stay equal and neither may be dated in the future. A drift check is
worth automating — compare each constant against
`git log -1 --format=%ad --date=short -- <page sources>` in CI. Not implemented yet;
it needs a route-to-source map maintained alongside the constants.

**Structured data.** One `WebSite` node per graph, `@id`-linked. Home uses
`WebApplication`; other public pages use `WebPage`; `/install` adds
`SoftwareApplication`; `/faq` owns `FAQPage`.

**Robots.** Indexing is enabled only for `ZOPTION_DEPLOY_ENV=production`. Preview and
staging builds get a global `X-Robots-Tag: noindex, nofollow` and no sitemap.

## Getting real data

This document ranks opportunities qualitatively. To prioritize on evidence:

1. Connect Search Console and set `GSC_SITE_URL`, then run the SEO skill's
   `gsc_client.py --striking` for keywords at positions 4–20 — the cheapest wins.
2. Set `AHREFS_TOKEN` and `COMPETITORS` to run `content_attack_brief.py` for volume,
   difficulty, and competitor gap data.
3. Add `zoption.site` to Google Search Console and submit the sitemap once the
   Cloudflare crawler issue is resolved.

## Checklist

- [ ] Allow GPTBot, ClaudeBot, Google-Extended, Applebot-Extended in Cloudflare
- [ ] Verify live `robots.txt` has no conflicting `Disallow`
- [ ] Verify `zoption.site` is indexed (`site:zoption.site`)
- [ ] Submit sitemap in Search Console
- [x] Cluster A import pages (hub + 5 bank guides)
- [ ] Decide on Cluster B Philippine budgeting guides
- [ ] Decide on the interactive 50/30/20 peso calculator
- [ ] Connect GSC and Ahrefs to replace qualitative ranking with real data
- [ ] Automate the content-date drift check

## Known build issue

`pnpm build` in `apps/web` fails on a clean `dist` with
`ENOENT ... dist/_headers`. The `zoption-deployment-headers` plugin reads
`dist/_headers` in `closeBundle`, but Vite 8 copies `public/` *after* `closeBundle`
runs, so the file does not exist yet on a first build. It succeeds on a second run
because the first run's copy lands in `dist`. Anyone building after wiping `dist`
will hit this; the fix is either to stop the plugin depending on a copied file or to
read the source from `public/_headers` directly.
