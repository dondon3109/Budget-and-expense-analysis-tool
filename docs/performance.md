# Performance and accessibility report

## Measured result

Lighthouse CI ran three desktop samples of the production public site build (`apps/site`, served by `wrangler pages dev`) on seven routes: `/`, the three legal pages, `/install`, a guide, and the 50/30/20 calculator, on 2026-09-29. All configured assertions passed:

| Metric                   |                                       Result |
| ------------------------ | -------------------------------------------: |
| Performance              |                           100 on every route |
| Accessibility            | 94 (landing), 96 (calculator), 100 elsewhere |
| Best practices           |                  96 (install), 100 elsewhere |
| SEO                      |                            92 on every route |
| Largest Contentful Paint |                                   424–494 ms |
| Landing transfer         |                                262,425 bytes |
| Guide page transfer      |                                128,562 bytes |

The enforced floors are 90 for each Lighthouse category, LCP at or below 2.5 seconds, CLS at or below 0.1, and total transfer at or below 750 KB. Results are local lab measurements, not field data; they should be rerun from CI and compared with Cloudflare analytics after launch.

## Design choices behind the result

- The public site is static HTML: content pages load one 8 KB script, and React loads only on pages with an island (the landing sections, the calculator, the support chat, the live APK card). PostHog loads only after analytics consent.
- SEO reads 92 only because Lighthouse's `robots-txt` audit does not recognise the `Content-Signal` line (see `docs/seo.md`). Accessibility findings: the landing eyebrow text and the calculator's closing link miss contrast, and the review star row carries `aria-label` on a plain `div`; all three predate the split. Best practices on `/install` records the R2 CORS rejection that only a `localhost` origin sees.
- Route-level lazy loading keeps the charting library out of the app's first bundle.
- Integer-centavo calculations avoid client/server rounding drift.
- The dashboard database query reads only the requested period, useful six-month trend window, and applicable monthly budgets.
- Transaction lists are paginated; CSV export has a 5,000-row ceiling; imports are limited to 1 MB and 500 rows.
- Semantic controls, visible focus, text equivalents for charts, responsive layouts, and corrected color contrast support keyboard and screen-reader use.

Run `pnpm --filter @zoption/site build && pnpm lighthouse` to reproduce the lab gate.
