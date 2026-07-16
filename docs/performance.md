# Performance and accessibility report

## Measured result

Lighthouse CI ran three production-build desktop samples against the landing route. All configured assertions passed:

| Metric                   |        Result |
| ------------------------ | ------------: |
| Performance              |     100 / 100 |
| Accessibility            |     100 / 100 |
| Best practices           |     100 / 100 |
| SEO                      |     100 / 100 |
| Largest Contentful Paint |    490–534 ms |
| Cumulative Layout Shift  |             0 |
| Landing transfer         | 101,874 bytes |

The enforced floors are 90 for each Lighthouse category, LCP at or below 2.5 seconds, CLS at or below 0.1, and total transfer at or below 750 KB. Results are local lab measurements, not field data; they should be rerun from CI and compared with Cloudflare analytics after launch.

## Design choices behind the result

- Route-level lazy loading keeps the charting library out of the landing bundle.
- Integer-centavo calculations avoid client/server rounding drift.
- The dashboard database query reads only the requested period, useful six-month trend window, and applicable monthly budgets.
- Transaction lists are paginated; CSV export has a 5,000-row ceiling; imports are limited to 1 MB and 500 rows.
- Semantic controls, visible focus, text equivalents for charts, responsive layouts, and corrected color contrast support keyboard and screen-reader use.

Run `pnpm build && pnpm lighthouse` to reproduce the lab gate.
