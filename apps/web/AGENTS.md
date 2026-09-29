# apps/web

## Overview

The browser product: a prerendered public site plus the signed in application under `/app`. It is one React and Vite bundle that talks to the Worker API with a Supabase bearer token. It owns browser workflows, previews, and consent UI, never financial authority.

## Stack

- **Language / Runtime**: TypeScript, React 19, Vite 8
- **Styling**: hand written semantic CSS; theme tokens and self-hosted fonts (Geist, Bricolage Grotesque) come from `@zoption/web-common/tokens.css`, surface styles live in `src/styles/`, component CSS sits beside each component. Tailwind v4 is imported once in `foundation.css` but is not the design tool
- **Server state**: TanStack Query, always keyed by workspace
- **Validation**: `@zoption/shared` zod schemas
- **Tests**: Vitest with jsdom opted in per file; Playwright specs live in the root `e2e/`

## Key files

| File                        | Owns                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`               | Route table for the private app                                                                                  |
| `src/PublicRoutes.tsx`      | Public route elements built from the metadata manifest                                                           |
| `src/seo/siteMetadata.ts`   | `PublicRoutePath`, `PUBLIC_ROUTE_PATHS`, and per route metadata; the prerender list comes from here              |
| `src/lib/api/index.ts`      | The barrel every caller and every `vi.mock("../src/lib/api")` goes through                                       |
| `src/lib/api/transport.ts`  | Bearer attachment, one refresh retry, sign-out on 410, the request timeout, and one timeout retry for reads      |
| `src/lib/api/errors.ts`     | `ApiRequestError` and the billing limit guards                                                                   |
| `src/lib/api/<domain>.ts`   | The calls for one API surface, named like the Worker route (`goals.ts`, `transactions.ts`, `admin-providers.ts`) |
| `src/lib/queryKeys.ts`      | Workspace scoped query key roots                                                                                 |
| `src/queries/<domain>.ts`   | Query options, `useX` hooks, and the invalidation helper for each write                                          |
| `src/auth/AuthProvider.tsx` | Session restore, code exchange, and the cache reset on identity change                                           |
| `deployment-config.ts`      | Build time environment validation and the derived CSP origin list                                                |
| `scripts/prerender.mjs`     | Prerender step that writes `_headers`, `robots.txt`, `sitemap.xml`, `404.html`, and the `llms.txt` page lists    |
| `tests/`                    | Flat Vitest suites for the whole app                                                                             |

## Commands

```bash
pnpm --filter @zoption/web dev     # vite on 5173, proxies /api and /health to 8787
pnpm --filter @zoption/web build   # typecheck, client build, SSR build, prerender
pnpm --filter @zoption/web typecheck
pnpm --filter @zoption/web test    # the root Vitest `web` project; append a path to filter
pnpm verify:web                    # typecheck, lint, format, and tests for this package
pnpm test:e2e                      # Playwright, from the repo root
```

## Conventions

- Adding a public route is a typed three place edit: the `PublicRoutePath` union, `PUBLIC_ROUTE_PATHS`, and `PUBLIC_ROUTE_METADATA` in `src/seo/siteMetadata.ts`, plus `PUBLIC_ROUTE_ELEMENTS` in `src/PublicRoutes.tsx`. The prerender list follows the manifest, so a missing entry is a missing page.
- Private pages load lazily with the `lazy(async () => ({ default: module.X }))` shape. Public pages are eager so prerendering can reach them.
- Public route code must be safe to render on the server: no `window` or `document` at module scope, and no Query or Auth provider in `src/entry-server.tsx`.
- A section split out of a long page moves its rules into its own stylesheet beside it (`Component.css`) instead of growing the page stylesheet. Stylesheets are global, so keep the selectors unchanged and import the new file where the page imported the old block, which preserves cascade order. Older sections (`components/landing/`, `components/assistant/`, several dashboard cards) still rely on their page stylesheet; `node scripts/check-structure.mjs` stops those files from growing.
- Name a component file in PascalCase with its own `Component.css` sibling, put hooks in `src/hooks` as `useX.ts`, and end page component names in `Page`.
- Send authenticated requests only through the `src/lib/api` helpers. Components never call `fetch` for private data. Import from `lib/api`, never a file inside it, because tests mock the barrel. Files inside the folder import each other with relative `./x` paths, and a new call goes in its domain file, which the barrel re-exports.
- Server state: read through the `useX` hook or `xQueryOptions` factory in `src/queries/<domain>.ts`. Spread the options when a screen needs its own `enabled`, `refetchInterval`, or `placeholderData`. Keys come only from `queryKeys.*(workspace)`. After a write, call the `invalidate*` helper in the same module that matches the write. The helpers refresh different key sets on purpose, so check the screens that depend on a set before merging two. Derive values at render and never mirror query data into local state.
- `hooks/useBillingSummary.ts` re-exports the hook from `src/queries/billing.ts`. Components import it from `hooks/` because five suites mock that path.
- Validate at the boundary with the shared zod schema (`safeParse` in forms, `parse` for payloads).
- Tests go in `apps/web/tests/` in kebab case, with `// @vitest-environment jsdom` as line 1 when the DOM is needed.
- New suites can use `tests/helpers/`: `renderWithProviders` wraps a query client and a memory router, and `createApiMock([...])` builds typed `lib/api` stubs for `vi.mock`. Move an existing suite onto them only when you are already changing it.

## Gotchas

- `apps/web/tests/` is the only collected test directory. The root Vitest `web` project includes `apps/web/tests/**`, so a test placed beside its source never runs.
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
