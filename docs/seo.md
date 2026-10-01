# SEO

Status notes for organic and AI search on [zoption.site](https://zoption.site).

## Verdict

The public site is its own static build: [`apps/site`](../apps/site/AGENTS.md) (Astro) at
`zoption.site`, separate from the signed-in app at `app.zoption.site`, which is noindex on
every response. Every public route is real HTML with its canonical URL, OpenGraph and
Twitter cards, and a Schema.org graph, and content pages ship no framework JavaScript;
only the landing sections, the calculator, the support chat, and the live APK card
hydrate. Lighthouse on seven representative pages measured 100 for performance and an
LCP of 424–494 ms (2026-09-29, local desktop runs of the production build).

Technical correctness is not what is holding the site back. Two things are:

1. A Cloudflare configuration is overriding the crawler policy the app declares.
2. The site has **eight indexable URLs, none of which target any search demand.**

## Resolved: Cloudflare was overriding the crawler policy

**Fixed 2026-08-31.** _Manage your robots.txt_ is now off for the `zoption.site` zone,
and the live file carries no `Disallow` for any agent:

```sh
curl -s https://zoption.site/robots.txt | grep -c Disallow   # 0
```

The state before the fix: Cloudflare prepended a managed block that disallowed the
same agents the app explicitly allowed:

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

This contradicts stated intent in two places:

- `/llms.txt` (template `apps/site/src/content/llms.txt`) — written specifically for AI consumption.
- The FAQ entry and `/faq` structured data telling users to add Zoption as a Google
  Preferred Source.

The intent is to allow AI _search_ while refusing AI _training_. Blocking GPTBot and
Google-Extended undermines that.

**Code side.** `robotsText` in `apps/site/src/seo/discovery.ts` emits a single wildcard group, `User-agent: * /
Allow: /`, and never restates per-agent `Allow` rules; `robots.test.ts` fails if anyone
re-adds them. The same group carries
`Content-Signal: search=yes, ai-input=yes, ai-train=no` (Cloudflare's content signals
policy), which states the search-yes, training-no intent the managed block used to imply.
Crawlers that do not recognise the line ignore it.

**Dashboard side.** In Cloudflare for the `zoption.site` zone: **Bots** → _Manage your
robots.txt_ → off. This could not be done from the repository — the managed block is
injected above the origin response at the edge, so no origin file can override it. If
the zone is ever recreated or the setting is re-enabled, this is the first thing to
re-check.

## `llms.txt` and `llms-full.txt`

Both templates live in `apps/site/src/content/` and hold hand-written product facts and boundaries.
Their page lists are not hand-written: each file carries one `{{public-pages}}` marker
that the `/llms.txt` and `/llms-full.txt` endpoints replace with every `PUBLIC_ROUTE_PATHS`
entry, using the route's canonical URL, title, and meta description
(`apps/site/src/seo/discovery.ts`). A new public route
therefore reaches `llms.txt` and the sitemap together. `llms.test.ts` fails if either
template loses its marker. Update the product-fact sections by hand when a feature,
plan limit, or import preset changes.

## The real constraint: eight indexable URLs

All eight public routes are product, pricing, or legal pages:

| Route               | Type    | Search demand targeted |
| ------------------- | ------- | ---------------------- |
| `/`                 | product | brand only             |
| `/pricing`          | product | brand only             |
| `/changelog`        | product | brand only             |
| `/install`          | product | brand only             |
| `/faq`              | support | long-tail only         |
| `/terms-of-service` | legal   | none                   |
| `/privacy-policy`   | legal   | none                   |
| `/cookie-policy`    | legal   | none                   |

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
Ahrefs or Search Console data is connected — see _Getting real data_ below. Rankings
are qualitative, based on observed competitor coverage.

### Cluster A — bank and wallet import (best fit)

An entire industry ranks for these terms: `statementedge.com/convert/ph/bdo`,
`bankstatemently.com/banks/ph`, `sheetmybank.com/convert/bdo`,
`bank-statementconverter.com/banks/country/philippines`.

They are one-shot converters: a user converts a statement, then still needs somewhere
to _put_ the data. Zoption is a budgeting app that already ships BPI, BDO, and
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

**Shipped.** Each guide is an entry in `packages/shared/src/financeGuides.ts`:

- `/guides/budget-monthly-salary-philippines`
- `/guides/50-30-20-rule-pesos`
- `/guides/track-gcash-maya-without-bank-linking`
- `/guides/budget-semi-monthly-pay-kinsenas-katapusan`
- `/guides/emergency-fund-philippines`
- `/guides/budget-13th-month-pay-philippines`
- `/guides/how-to-budget-for-beginners-philippines`, `/guides/budget-allowance-philippines`,
  `/guides/how-to-save-money-philippines`: head terms Search Console showed no impressions
  for (budget, budgeting, how to budget, allowance, save money, finance). The home page and
  the two feature pages carry voice input, receipt, and transaction wording for the rest.
  Search Console (2026-10-01) listed only `zoption` (61 impressions), spaced and hyphenated
  brand misspellings (`z option`, `z-option`), and Maya cancellation queries.

Legal and tax facts (13th month pay, deposit insurance) are stated without figures that
change by statute, such as the bonus tax ceiling or the PDIC maximum, and point to the
agency that owns the number. `finance-guides.test.ts` keeps these guides free of iOS,
app-store, and rating claims.

### Cluster C — interactive tools

An interactive 50/30/20 calculator in pesos is the strongest link magnet available
and matches the product's centavo-precision story.

**Shipped.** `/tools/50-30-20-calculator` runs fully client-side with no account and
no network call. Percentages are adjustable, and allocation happens in integer
centavos via the largest-remainder method
(`apps/site/src/views/tools/allocateBudget.ts`), so the three buckets always sum to
exactly the income entered. `budgetCalculator.test.ts` asserts that invariant for
every amount from 0 to ₱1,000.00 in one-centavo steps — the property most competing
calculators get wrong, and the one worth claiming.

It also targets the peso phrasing the guide pages will use, and it is the page most
likely to attract links, so it carries sitemap priority 0.8.

### Cluster D — feature explainers

- `/features/receipt-scanning`, `/features/voice-expense-entry`

Note that `/faq` already carries `FAQPage` markup. Keep it the only page with that
type — `seo-metadata.test.ts` enforces it.

## Guardrails when adding routes

New public routes must be registered in `apps/site/src/seo/siteMetadata.ts`
(`PublicRoutePath`, `PUBLIC_ROUTE_PATHS`, `PUBLIC_ROUTE_METADATA`) and get a route file in
`apps/site/src/pages/`. The sitemap and `llms.txt` derive from the manifest, and
`apps/site/scripts/finalize-build.mjs` fails the build when a listed route has no page,
a wrong canonical, or a graph that breaks the rules below.

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
the two must stay equal and neither may be dated in the future. The drift check is
implemented: `apps/site/tests/content-freshness.test.ts` compares every declared date
against the last commit that modified the page's sources (`--diff-filter=M`, so adding
or moving a file never forces a bump), using the route-to-source map in
`apps/site/src/seo/contentSources.ts`. Add a map entry in the same change that
publishes a route; CI checks out full history for this (`fetch-depth: 0`).

**Structured data.** One `WebSite` node per graph, `@id`-linked. Home uses
`WebApplication`; other public pages use `WebPage`; `/install` adds
`SoftwareApplication`; `/faq` owns `FAQPage`.

**Robots.** Indexing is enabled only for `ZOPTION_DEPLOY_ENV=production`. Preview and
staging builds get a global `X-Robots-Tag: noindex, nofollow` and no sitemap. The app
origin is always noindex and allows crawling, so crawlers can see that header.

**Query strings.** Pages are static, so a URL with any query renders the same HTML as
the clean one and its canonical points there. Analytics counts only campaign
parameters (see `docs/analytics.md`).

**Lighthouse SEO score.** It reads 92, not 100, only because Lighthouse's `robots-txt`
audit does not know the `Content-Signal` line. Crawlers ignore unknown lines; the
line stays because it states the search-yes, training-no policy.

## Getting real data

This document ranks opportunities qualitatively. To prioritize on evidence:

1. Connect Search Console and set `GSC_SITE_URL`, then run the SEO skill's
   `gsc_client.py --striking` for keywords at positions 4–20 — the cheapest wins.
2. Set `AHREFS_TOKEN` and `COMPETITORS` to run `content_attack_brief.py` for volume,
   difficulty, and competitor gap data.
3. Add `zoption.site` to Google Search Console and submit the sitemap once the
   Cloudflare crawler issue is resolved.

## Checklist

- [x] Make `robots.txt` a single source of truth (`apps/site/src/seo/discovery.ts`, no conflicting
      `Allow` groups) — code side done
- [x] Turn off _Manage your robots.txt_ in the Cloudflare dashboard (2026-08-31)
- [x] Verify live `robots.txt` has no `Disallow` — confirmed 0
- [x] Ship the search-demand pages (live sitemap lists 25 URLs, checked 2026-09-24)
- [ ] Verify `zoption.site` is indexed (`site:zoption.site`)
- [ ] Submit sitemap in Search Console
- [x] Cluster A import pages (hub + 5 bank guides)
- [x] Interactive 50/30/20 peso calculator (`/tools/50-30-20-calculator`)
- [x] Generate the `llms.txt` page lists from the route manifest
- [x] Cluster B Philippine budgeting guides
- [x] Cluster D feature explainers (`/features/receipt-scanning`, `/features/voice-expense-entry`)
- [ ] Connect GSC and Ahrefs to replace qualitative ranking with real data
- [x] Automate the content-date drift check (`apps/site/tests/content-freshness.test.ts`)
- [x] Serve the public site as its own static build with zero framework JS on content pages
- [ ] Resubmit the sitemap after the subdomain cutover (docs/deployment.md)

## Build pipeline

`pnpm --filter @zoption/site build` runs three steps, and `apps/site/dist` is what the
`zoption-site` Pages project serves:

1. `astro check` — types across `.astro`, `.ts`, and `.tsx`
2. `astro build` — every route to static HTML, plus the `sitemap.xml`, `robots.txt`,
   `llms.txt`, `llms-full.txt`, and `release.json` endpoints
3. `node scripts/finalize-build.mjs` — writes `_headers` (the CSP with a hash for each
   inline island bootstrap, cache rules, `Speculation-Rules`, and noindex outside
   production), drops the sitemap outside production, and verifies the output

**Caching.** Pages edge-caches every file and purges on deploy. HTML revalidates on each
request (`max-age=0, must-revalidate`), hashed assets under `/_astro/` are immutable for
a year, images for a day, and the discovery files for an hour. Same-origin links
prefetch on hover through the `Speculation-Rules` header; prerendering is deliberately
not enabled because it would count a pageview for a page the visitor never opened.
