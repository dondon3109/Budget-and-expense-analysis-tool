# apps/site

## Overview

The public website at `zoption.site`: marketing, pricing, guides, import guides, tools, legal, and the Android Beta download. It is a static Astro build. Pages render existing React components to HTML at build time and ship no framework JavaScript unless they contain an island. The signed-in app lives in `apps/web` on `app.zoption.site`, and every sign-in, sign-up, and workspace link goes there through `appUrl()`.

## Stack

- **Framework**: Astro 7 (`output: "static"`, `build.format: "file"`, no trailing slashes), React 19 for components and islands
- **Styling**: `@zoption/web-common/tokens.css` plus `src/styles/foundation.css` (site primitives), with component CSS beside each component
- **Client script**: `src/client/site.ts`, the only script every page loads, wires the `data-*` hooks. PostHog (`src/client/analytics.ts`) loads only after analytics consent
- **Hosting**: Cloudflare Pages; `functions/ingest/[[path]].ts` is the one Pages Function (the PostHog proxy)
- **Tests**: Vitest project `site`, in `apps/site/tests/`

## Key files

| File                           | Owns                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/seo/siteMetadata.ts`      | `PublicRoutePath`, `PUBLIC_ROUTE_PATHS`, per-route metadata, JSON-LD, and the sitemap dates |
| `src/seo/discovery.ts`         | `sitemap.xml`, `robots.txt`, and the `llms.txt` page list, all derived from the manifest    |
| `src/seo/contentSources.ts`    | Route-to-source map for the content freshness guard                                         |
| `src/layouts/BaseLayout.astro` | The `<head>` (metadata, canonical, OG, JSON-LD), consent UI, and the shared client script   |
| `src/pages/`                   | One route file per page; dynamic families use `getStaticPaths` over their data module       |
| `src/views/`                   | Page bodies as React components, rendered to static HTML                                    |
| `src/client/site.ts`           | Theme menu, header drawer, filters, pricing toggle, FAQ anchors, sticky CTA, consent        |
| `src/lib/appUrl.ts`            | The app origin; `PUBLIC_APP_URL` overrides it for preview builds                            |
| `deployment-config.ts`         | Build-time env validation and the CSP                                                       |
| `scripts/finalize-build.mjs`   | Writes `dist/_headers` (CSP with inline-script hashes, cache rules) and verifies the output |
| `functions/ingest/[[path]].ts` | Same-origin PostHog capture proxy that strips cookies and client addresses                  |
| `public/service-worker.js`     | Kill switch for the PWA worker `zoption.site` served before the app moved                   |

## Commands

```bash
pnpm --filter @zoption/site dev        # astro dev on 4321
pnpm --filter @zoption/site build      # astro check, astro build, finalize-build
pnpm --filter @zoption/site typecheck  # astro check
pnpm verify:site                       # typecheck, lint, format, and the site Vitest project
```

## Conventions

- Adding a public page: add the path to `PublicRoutePath`, `PUBLIC_ROUTE_PATHS`, and `PUBLIC_ROUTE_METADATA` in `src/seo/siteMetadata.ts`, add its route file under `src/pages/`, and add its sources to `src/seo/contentSources.ts`. `finalize-build.mjs` fails the build when a listed route has no page.
- Keep page bodies static. Interaction that fits in a few lines goes in `src/client/site.ts` behind a `data-*` hook, with every state present in the HTML (see the pricing intervals and the guide filter). Only real widgets become islands (`client:visible`, or `client:idle` for the support chat), passed to the page as named slots.
- An island imports `@zoption/shared/money`, never the `@zoption/shared` barrel, which would bundle zod into the page.
- No inline scripts beyond Astro's island bootstrap, which `finalize-build.mjs` hashes into the CSP. JSON-LD data blocks are exempt.
- Content dates: bump a route's date when its visible content changes. The freshness guard counts only commits that modify a source (`--diff-filter=M`), so adding or moving a file does not force a bump.

## Gotchas

- Customer reviews render at build time. A newly approved review appears with the next deploy, and a production Pages build fails if `GET /api/reviews` fails.
- Astro passes named slots as props its type check cannot see, so slot props on page components are optional.
- `wrangler pages deploy` compiles `functions/` relative to its working directory, so deploy from `apps/site`.

## Related specs

- `docs/seo.md`, `docs/analytics.md`, `docs/deployment.md`
