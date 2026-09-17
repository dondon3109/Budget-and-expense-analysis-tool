# 0001. Add the search demand pages for peso budgeting and Zoption features

**Date**: 2026-09-17
**Status**: Accepted

## Summary

Add the four public pages that `docs/seo.md` identified as open search demand but never built: two Philippine peso budgeting guides and two feature explainer pages. They reuse the pipelines that already publish every other public page (the guide data in `@zoption/shared`, the route manifest in `apps/web/src/seo/siteMetadata.ts`, prerendering, and the sitemap), so nothing new has to be invented to get them indexed. Every claim on the pages has to be true of the shipped product, because a finance site is held to a strict accuracy bar.

## Context

`docs/seo.md` records a working technical setup and a content gap. Prerendering, canonicals, structured data, sitemap, and the crawler policy are in place. What is missing is content that targets demand: the sitemap holds 21 URLs, and the clusters that target real searches were only partly built.

Cluster A (bank statement import) shipped, as did the interactive 50/30/20 calculator. Cluster B (Philippine budgeting guides) shipped four guides, but two of the named topics were never written: how to budget a monthly salary, and how the 50/30/20 rule works in pesos. Cluster D (feature explainers) was never built at all, so the two most distinctive capabilities, receipt photo entry and voice expense entry, have no page a search engine can rank.

The cost of not deciding is drift: every month without these pages is a month of demand the site cannot answer, and informal page additions risk claims the product cannot keep. That risk is real here. The landing page currently advertises PDF statement import while the web importer accepts only CSV, XLSX, and XLS, so the new pages have a claim boundary to respect rather than inherit.

## Requirements

**User stories**:

- As someone searching for how to budget a Philippine salary, I want a concrete guide in pesos so that I can plan my own month without connecting a bank account.
- As someone comparing expense trackers, I want pages that explain receipt scanning and voice entry so that I can decide whether Zoption does what I need.
- As the product owner, I want each new page registered in one manifest so that prerendering, the sitemap, and metadata cannot drift apart.

**Acceptance criteria**:

- **AC-1**: `/guides/budget-monthly-salary-philippines` and `/guides/50-30-20-rule-pesos` render as guide pages, are prerendered to static HTML, appear in `sitemap.xml`, and carry unique titles, descriptions, and canonical URLs.
- **AC-2**: `/features/receipt-scanning` and `/features/voice-expense-entry` render as public pages in the same layout family as the guides, are prerendered, appear in `sitemap.xml`, and are reachable from at least one existing public page.
- **AC-3**: every capability claim on the four new pages maps to shipped code or documented behavior, and none of the four claims PDF import for the web app (the Android app reads PDF statements, which the copy may say), iOS availability, a bank connection, or ratings and reviews. The existing `/import` pages and the landing page keep their own claim review in the follow-up.
- **AC-4**: the 50/30/20 guide offers `/tools/50-30-20-calculator` as a related link, the calculator links back to the guide, the receipt explainer links to the Excel replacement guide and to the voice explainer, the voice explainer links to the GCash and Maya guide and back to the receipt explainer, and the landing page spotlight panels link to both explainers.
- **AC-5**: the guardrail suites stay green (`seo-metadata.test.ts`, `guides-pages.test.tsx`, `packages/shared/tests/finance-guides.test.ts` updated to the new guide set, the prerender verification script, and the content freshness guard covering the new routes with declared dates no older than their sources).

## Options considered

### Option 1: Data driven pages on the existing pipelines (chosen)

Both guide pages come from new entries in `FINANCE_GUIDES` in `packages/shared`. Both feature pages come from a small data module plus one page component in `apps/web/src/pages/features/`, registered in the same route manifest as every other public page. Metadata, prerendering, and the sitemap follow from the manifest.

**Pros**:

- The route manifest stays the single source of truth, which is what `docs/seo.md` requires.
- No new rendering path, no new dependency, and the guide pages inherit the existing tests and structured data builder.

**Cons**:

- A new route family (`/features/...`) means touching the `PublicRoutePath` union, the path list, the metadata map, and the router.

### Option 2: A hand written page component per route

Each page is its own component with its own metadata block, written independently of the guide data.

**Pros**:

- Each page can be shaped freely.

**Cons**:

- Metadata and sitemap entries drift the moment a page is edited, exactly the failure the manifest exists to prevent.
- Four copies of near identical layout code.

### Option 3: Guides only, feature explainers deferred

Ship the two guides and leave the explainer pages for a later pass.

**Pros**:

- Smaller change and less risk on claims.

**Cons**:

- Leaves the two most distinctive features invisible to search, which is the larger half of the demand gap.

## Decision

**Chosen option**: Option 1: Data driven pages on the existing pipelines.

Guides are added to `FINANCE_GUIDES`, feature explainers are added as a data driven `/features/` route family registered in the public route manifest, and both are published by the existing prerender and sitemap pipeline.

## Rationale

The manifest is already the mechanism that keeps a page, its metadata, its structured data, its sitemap entry, and its prerendered HTML in agreement, and `seo-metadata.test.ts` fails when they disagree. Routing four new pages through it costs one union member and one metadata helper and buys every existing guardrail. Hand writing the pages would trade that for freedom the pages do not need, since `docs/seo.md` fixes the layout conventions and the claim rules.

Keeping both clusters in one pass matters because the pages cross link: the peso guides need somewhere to send a reader who wants to see the product, and the explainer pages need the guides for depth. Splitting them would ship half a linking structure.

## Feature design

**Data model sketch**:

- `FinanceGuide` entries: both new guides declare `category: "budgeting"`, `readTimeMinutes` 8 and 6, `publishedDate` and `updatedDate` `2026-09-16` (the UTC calendar day, so the metadata test never sees a future date), the author "Zoption Personal Finance Team", six keywords, six sections, and three FAQs each. The type gains one optional field, `relatedLinks`, which the guide page renders as cards and which is how the 50/30/20 guide reaches the calculator.
- `FeaturePage` entries (new, in `apps/web/src/pages/features/featurePages.ts`): `path`, `title`, `description`, `heading`, `summary`, `keywords`, `sections` (each with `id`, `title`, `body`, optional `steps`), `relatedGuideSlug`, `relatedFeaturePath`. The module also owns `FEATURE_PAGES_LAST_MODIFIED = "2026-09-16"`, which feeds both the sitemap `lastmod` and `WebPage.dateModified`, with `changeFrequency: "monthly"` and priority 0.7 to match the guides.
- `FeatureRoutePath` (new type in the manifest): a closed union of the paths declared in the data module, not a `/features/${string}` template, so the metadata record and the router cannot silently miss a page; adding a page to `FEATURE_PAGES` fails typecheck until it is registered in both.

**API surface**: no API change. Every page is static, prerendered at build time.

**Value sourcing**:

| Action                | Value produced / displayed                                  | Source                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render a guide page   | Title, summary, sections, FAQs, read time, dates            | `FINANCE_GUIDES` entry in `packages/shared/src/financeGuides.ts`                                                                                                                                                                                |
| Render a guide page   | Canonical URL, sitemap last modified, structured data dates | `PUBLIC_ROUTE_METADATA` derived from the guide entry in `apps/web/src/seo/siteMetadata.ts`                                                                                                                                                      |
| Render a feature page | Heading, intro, sections, cross links                       | `FEATURE_PAGES` entry in `apps/web/src/pages/features/featurePages.ts`                                                                                                                                                                          |
| Render a feature page | Title, description, canonical, structured data              | `featurePageMetadata(path)` reading the same `FEATURE_PAGES` entry                                                                                                                                                                              |
| Both                  | Prerendered HTML and sitemap entry                          | `PUBLIC_ROUTE_PATHS` in the manifest, consumed by `apps/web/scripts/prerender.mjs`                                                                                                                                                              |
| Both                  | Claim wording                                               | Shipped behavior only: import presets in `packages/shared`, receipt and voice components in `apps/web/src/components/receipts/` and `apps/web/src/components/transactions/TransactionVoiceEntry.tsx`, calculator in `apps/web/src/pages/tools/` |

**Key invariants**:

- A route exists in exactly one place: the manifest entry, the router element, and the data module agree, and the guardrail tests fail if a manifest route has no page.
- No `FAQPage`, `Offer`, `Review`, or `SoftwareApplication` node appears on the new pages; `/faq` and `/install` keep their unique types.
- No page states a capability the web app does not have.

**Security model**: all four pages are public and indexable. They carry no user data, no account state, and no query parameters.

**Configuration required**: none.

**Critical test scenarios**:

- Happy path: each new route renders its heading and sections, and its manifest entry is prerendered into the sitemap, verifies AC-1, AC-2.
- Failure case: a manifest route without a page component, or a feature page without a manifest entry, fails the guardrail suite instead of shipping silently, verifies AC-2, AC-5.
- Content: the claim audit asserts no banned claim text (PDF import on web, iOS availability, bank connection, ratings) appears in the new page copy, verifies AC-3.

## Build plan

Order follows the project Tracer Bullet approach: one page travels the whole pipeline first, then the remaining pages follow the same proven path.

1. Add the salary budgeting guide to `FINANCE_GUIDES` and update the guide set test to the new count and slugs, satisfies **AC-1**, **AC-5**
2. Add the 50/30/20 in pesos guide and its link to the calculator, then add the calculator link back to the guide, satisfies **AC-1**, **AC-4**
3. Register the `/features/` route family in the manifest, the router, and the prerender path, satisfies **AC-2**
4. Build the receipt scanning page end to end and confirm it prerenders into the sitemap, satisfies **AC-2**, **AC-3**
5. Build the voice entry page with the cross links between both feature pages and their related guides, satisfies **AC-2**, **AC-4**
6. Add the claim audit assertions and run the guardrail suites, satisfies **AC-3**, **AC-5**

## Consequences

**Positive**:

- Four more indexable URLs target demand the site currently cannot answer, with internal links that distribute authority to the calculator and the guides.
- The claim audit gives a written boundary for future content.

**Negative / tradeoffs**:

- More content to keep honest over time, which is what the content freshness guard in the web scope exists to police.
- The `/features/` family widens the public route surface, so every future explainer must be registered rather than dropped in as a file.

**Neutral**:

- `packages/shared/tests/finance-guides.test.ts` changes from a fixed count of four guides to the new set.

## Follow-up

- [ ] Add a `/features` hub page once a third explainer exists.
- [ ] Decide whether to fix or reword the landing page PDF import claim for web surfaces.
