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

- `apps/web/public/llms.txt` — written specifically for AI consumption.
- The FAQ entry and `/faq` structured data telling users to add Zoption as a Google
  Preferred Source.

The intent is to allow AI _search_ while refusing AI _training_. Blocking GPTBot and
Google-Extended undermines that.

**Code side.** `scripts/robots.mjs` emits a single wildcard group, `User-agent: * /
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

Both files live in `apps/web/public/` and hold hand-written product facts and boundaries.
Their page lists are not hand-written: each file carries one `{{public-pages}}` marker
that `prerender.mjs` replaces with every `PUBLIC_ROUTE_PATHS` entry, using the route's
canonical URL, title, and meta description (`scripts/llms.mjs`). A new public route
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
(`apps/web/src/pages/tools/allocateBudget.ts`), so the three buckets always sum to
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
the two must stay equal and neither may be dated in the future. The drift check is
implemented: `apps/web/tests/content-freshness.test.ts` compares every declared date
against the last commit that touched the page's sources, using the route-to-source map
in `apps/web/src/seo/contentSources.ts`. Add a map entry in the same change that
publishes a route, and bump that page's date; CI checks out full history for this
(`fetch-depth: 0`).

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

- [x] Make `robots.txt` a single source of truth (`scripts/robots.mjs`, no conflicting
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
- [x] Automate the content-date drift check (`apps/web/tests/content-freshness.test.ts`)

## Build pipeline

`pnpm --filter @zoption/web build` runs four ordered steps, and `dist/` is what gets
deployed (`wrangler pages deploy apps/web/dist`):

1. `typecheck`
2. `vite build` — client bundle into `dist/`
3. `vite build --ssr src/entry-server.tsx --outDir dist-ssr`
4. `node scripts/prerender.mjs` — renders every `PUBLIC_ROUTE_PATHS` entry to static
   HTML, then writes `robots.txt`, `sitemap.xml`, and the `llms.txt` page lists

Two consequences are easy to miss:

- **The shipped `robots.txt` is generated, not a file in `public/`.** `prerender.mjs`
  overwrites `dist/robots.txt` on every build, so `public/robots.txt` never reached
  production and has been deleted. The policy now lives in `scripts/robots.mjs` and is
  covered by `apps/web/tests/robots.test.ts`.
- **`prerender` is single-shot by design.** It deletes `dist-ssr` when it finishes so a
  later pass can never silently render a stale bundle. Running it twice without
  redoing the SSR build fails fast with a message naming the missing file. Always use
  `pnpm build`, which runs the steps in order.

An earlier revision of this document claimed a Vite 8 race caused
`ENOENT dist/_headers`. That was wrong: Vite copies `public/` during `renderStart`,
before bundling, so the file is always present by `closeBundle`. The observed failures
came from re-running `prerender` against an already-prerendered `dist/`.
