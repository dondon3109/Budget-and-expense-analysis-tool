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

**Fixed 2026-08-31.** *Manage your robots.txt* is now off for the `zoption.site` zone,
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

The `Content-Signal: search=yes,ai-train=no,use=reference` header shows the intent is
to allow AI *search* while refusing AI *training*. Blocking GPTBot and Google-Extended
undermines that.

**Code side is done.** `scripts/robots.mjs` no longer repeats `Allow` rules for agents
the Cloudflare block already covers. Restating them produced two equally specific,
conflicting groups with no defined winner — crawlers resolve that tie restrictively, so
the duplicate group could not win and only added ambiguity. The wildcard
`User-agent: * / Allow: /` already permits those agents the moment the edge stops
blocking them, and `robots.test.ts` fails if anyone re-adds the redundant rules.

**Code side.** `scripts/robots.mjs` no longer repeats `Allow` rules for agents the
Cloudflare block covered. The wildcard `User-agent: * / Allow: /` now permits those
agents on its own, and `robots.test.ts` fails if anyone re-adds the redundant rules.

**Dashboard side.** In Cloudflare for the `zoption.site` zone: **Bots** → *Manage your
robots.txt* → off. This could not be done from the repository — the managed block is
injected above the origin response at the edge, so no origin file can override it. If
the zone is ever recreated or the setting is re-enabled, this is the first thing to
re-check.

> **Note:** the live `robots.txt` still shows the pre-consolidation content with
> redundant per-agent `Allow` groups. That is expected — it is the previously deployed
> build. The consolidated file ships with the next release. It is a cleanup, not a
> blocker: the old file allows the same crawlers.

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

- [x] Make `robots.txt` a single source of truth (`scripts/robots.mjs`, no conflicting
      `Allow` groups) — code side done
- [x] Turn off *Manage your robots.txt* in the Cloudflare dashboard (2026-08-31)
- [x] Verify live `robots.txt` has no `Disallow` — confirmed 0
- [ ] **Ship it: commit and push.** Production is 5 commits behind `origin/main`, so
      none of the work below is live yet (sitemap still lists 8 URLs, `/tools/...` 404s)
- [ ] Verify `zoption.site` is indexed (`site:zoption.site`)
- [ ] Submit sitemap in Search Console
- [x] Cluster A import pages (hub + 5 bank guides) — **built, not deployed**
- [x] Interactive 50/30/20 peso calculator (`/tools/50-30-20-calculator`) — **built,
      not deployed**
- [ ] Decide on Cluster B Philippine budgeting guides
- [ ] Decide on Cluster D feature explainers
- [ ] Connect GSC and Ahrefs to replace qualitative ranking with real data
- [ ] Automate the content-date drift check

## Build pipeline

`pnpm --filter @zoption/web build` runs four ordered steps, and `dist/` is what gets
deployed (`wrangler pages deploy apps/web/dist`):

1. `typecheck`
2. `vite build` — client bundle into `dist/`
3. `vite build --ssr src/entry-server.tsx --outDir dist-ssr`
4. `node scripts/prerender.mjs` — renders every `PUBLIC_ROUTE_PATHS` entry to static
   HTML, then writes `robots.txt` and `sitemap.xml`

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
