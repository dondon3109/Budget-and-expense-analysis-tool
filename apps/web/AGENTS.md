# apps/web

## Overview

The browser product: a prerendered public site plus the signed in application under `/app`. It is one React and Vite bundle that talks to the Worker API with a Supabase bearer token. It owns browser workflows, previews, and consent UI, never financial authority.

## Stack

- **Language / Runtime**: TypeScript, React 19, Vite 8
- **Styling**: hand written semantic CSS beside each component; Tailwind v4 is imported once but is not the design tool
- **Server state**: TanStack Query, always keyed by workspace
- **Validation**: `@zoption/shared` zod schemas
- **Tests**: Vitest with jsdom opted in per file; Playwright specs live in the root `e2e/`

## Key files

| File                        | Owns                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/App.tsx`               | Route table for the private app                                                                                    |
| `src/PublicRoutes.tsx`      | Public route elements built from the metadata manifest                                                             |
| `src/seo/siteMetadata.ts`   | `PublicRoutePath`, `PUBLIC_ROUTE_PATHS`, and per route metadata; the prerender list comes from here                |
| `src/lib/api.ts`            | Every authenticated HTTP call, bearer attachment, one refresh retry, one timeout retry for reads, and typed errors |
| `src/lib/queryKeys.ts`      | Workspace scoped query key roots                                                                                   |
| `src/auth/AuthProvider.tsx` | Session restore, code exchange, and the cache reset on identity change                                             |
| `deployment-config.ts`      | Build time environment validation and the derived CSP origin list                                                  |
| `scripts/prerender.mjs`     | Prerender step that writes `_headers`, `robots.txt`, `sitemap.xml`, and `404.html`                                 |
| `tests/`                    | Flat Vitest suites for the whole app                                                                               |

## Commands

```bash
pnpm --filter @zoption/web dev     # vite on 5173, proxies /api and /health to 8787
pnpm --filter @zoption/web build   # typecheck, client build, SSR build, prerender
pnpm --filter @zoption/web typecheck
pnpm test                          # from the repo root
pnpm test:e2e                      # Playwright, from the repo root
```

## Conventions

- Adding a public route is a typed three place edit: the `PublicRoutePath` union, `PUBLIC_ROUTE_PATHS`, and `PUBLIC_ROUTE_METADATA` in `src/seo/siteMetadata.ts`, plus `PUBLIC_ROUTE_ELEMENTS` in `src/PublicRoutes.tsx`. The prerender list follows the manifest, so a missing entry is a missing page.
- Private pages load lazily with the `lazy(async () => ({ default: module.X }))` shape. Public pages are eager so prerendering can reach them.
- Public route code must be safe to render on the server: no `window` or `document` at module scope, and no Query or Auth provider in `src/entry-server.tsx`.
- Name a component file in PascalCase with its own `Component.css` sibling, put hooks in `src/hooks` as `useX.ts`, and end page component names in `Page`.
- Send authenticated requests only through `src/lib/api.ts` helpers. Components never call `fetch` for private data.
- Keep server state in TanStack Query keyed through `queryKeys.*(workspace)` and derive values at render. Do not mirror query data into local state.
- Validate at the boundary with the shared zod schema (`safeParse` in forms, `parse` for payloads).
- Tests go in `apps/web/tests/` in kebab case, with `// @vitest-environment jsdom` as line 1 when the DOM is needed.

## Gotchas

- `apps/web/tests/` is the only collected test directory. Vitest includes `apps/**/tests/**`, so a test placed beside its source never runs.
- Build order is load bearing: typecheck, client build, SSR build, then prerender. The prerender step deletes `dist-ssr` and reads `.zoption-build/deployment.json` written by the client build.
- The build fails closed. `ZOPTION_DEPLOY_ENV` is required when `CF_PAGES=1`, a non production build must pass explicit `VITE_*` values, and production must point at `https://api.zoption.site`.
- Any new external origin needs an entry in `deployment-config.ts`; the CSP check fails the build on an unapproved wildcard.
- The service worker caches only static assets and public pages. `/api`, `/app`, auth routes, billing, any request with an `Authorization` header, and URLs carrying tokens are always network only.
- Optimistic transaction rows must mirror the server `ORDER BY` and filters in `src/lib/optimisticTransactions.ts`.
- There are no inline scripts. The theme is applied by `public/theme-bootstrap.js` because the CSP allows `script-src 'self'`.
- `src/main.tsx` keeps `<BrowserRouter>` outside the providers that remount when the signed-in user changes (`AssistantSessionProvider` keys its subtree by user id). A router inside them restarts on sign-in and re-reads `window.location`, which is how the sign-in callback used to report a successful sign-in as a failure.
- Money is integer minor units. Format only through `formatMoney` and never add float math.

## Related specs

- `docs/scope/web/scope.md`, `docs/seo.md`, `docs/deployment.md`, `docs/specs/web/0001-search-demand-pages.md`

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
