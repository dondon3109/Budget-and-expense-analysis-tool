# Agent guidance

Zoption is a budget and expense tracker: a React web app, an Expo Android/iOS app, and a Cloudflare Worker API that owns all financial data. Don prefers complex systems implemented as simply as possible.

## Working style

- A question is a read-only request. Answer it, then offer to implement.
- Keep changes scoped, type-safe, and covered by focused tests, not broad regression suites.
- Be cautious with destructive actions. Look before deleting or overwriting.
- Do not spawn subagents for work one agent can finish. If parallel agents are justified, give each non-overlapping files.
- Run `pnpm verify` before reporting done and report its result. A green scoped typecheck or test file does not prove the tree is green.

## Invariants

Never trade these for shorter code (details in `docs/maintainability.md`):

- Money is integer minor units (centavos) end to end. Parse only with the shared `parseAmountToMinor`; never float math.
- Every tenant data read and write is scoped by `tenantId` from the auth context, never from request input.
- Auth fails closed. Validate at I/O boundaries (HTTP bodies, env, storage, third-party APIs, user input) with `@zoption/shared` zod schemas, then trust the types internally.
- Mobile writes a mutation and its outbox row in one SQLite transaction.

## Implementation

- Write the smallest change that preserves behavior and contracts. Prefer fewer files, types, hooks, and wrappers; extract only reused or independently testable logic.
- When replacing logic, delete the old path instead of wrapping it. Keep error or compatibility handling you have not proven dead.
- In UI code, derive values during render. No `useState` plus sync `useEffect` to mirror props or query data.
- Prefer early returns and plain domain branches over clever maps or dense ternaries.
- Comments explain constraints and non-obvious why. Keep existing ones current.
- Match the local file's style.
- Design: no gradients on cards, floating cards, or backgrounds. Colors come from the theme tokens (web `apps/web/src/styles/`, mobile `apps/mobile/src/ui/tokens.ts`).

## Documentation

- Update the doc that owns a fact (command, config value, binding, external setting) in the same change that moves it.
- `docs/deployment.md` records what is actually configured in the Supabase, Cloudflare, PayPal, Dodo Payments, and Resend dashboards and how to read it back. No setting should need a dashboard login to learn.
- Record facts that stay true, not narration of what a commit did.

## Commits and releases

- Conventional Commits, imperative subject, optional scope: `feat` (minor), `fix` (patch), `feat!` or a `BREAKING CHANGE:` footer (major). Use `docs`, `test`, `chore`, `refactor`, `style`, `ci`, `build` for non-releasing work; never label maintenance as `feat`/`fix` to force a release.
- Never edit the web/product version by hand. semantic-release tags `main` after CI.
- Never deploy production manually. The `Production Release` workflow runs D1 migrations, the Worker and Pages deploys, smoke checks, and semantic-release; approving its `production` environment gate is the deploy. Manual commands are emergency recovery only and never run alongside it.
- Before a release, update the in-app patch notes so they match what ships: `apps/web/src/releases/currentRelease.ts` (the "What's new" list and `releaseHistory`), plus `apps/web/src/releases/androidRelease.json` once a new APK is published.
- Every release is a new web **and** mobile version. Bump `apps/mobile/package.json` `version` and `android.versionCode` in `apps/mobile/app.config.ts` (`0.2.34-beta` → `20334`). The signed APK is built and published by the `Android Beta Build` workflow (`docs/mobile/build-instructions.md`).
- `CHANGELOG.md`: add notable user-facing changes under `Unreleased`. After semantic-release succeeds, move them under the exact released version and date in a follow-up `docs:` commit. Never guess a version or mark a failed release as published.

## Stack

- TypeScript, Node 22+, pnpm 11 workspaces (`apps/*`, `packages/*`; `apps/stt-bridge` is a standalone Cloud Run service outside the workspace).
- Web: React 19 + Vite, TanStack Query. API: Hono on Cloudflare Workers, D1, Supabase Auth. Mobile: Expo + expo-router, encrypted SQLite. Shared: `@zoption/shared` zod schemas and domain rules.

## Commands

```bash
pnpm install
pnpm verify        # workspace links, typecheck, lint, format check, Vitest, mobile Jest; run before reporting done
pnpm dev           # api, web, and mobile together
pnpm test          # Vitest (apps/**/tests, packages/**/tests, scripts)
pnpm test:mobile   # colocated mobile Jest suites
pnpm test:e2e      # Playwright; applies local D1 migrations first
pnpm format        # prettier --write
```

## Package guides

Read the one for the area you touch:

- [apps/api/AGENTS.md](apps/api/AGENTS.md): Worker API, D1 migrations, tenancy, sync protocol
- [apps/web/AGENTS.md](apps/web/AGENTS.md): browser app, public routes, prerender, CSP
- [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md): Expo client, local workspace, outbox, Android releases
- [packages/shared/AGENTS.md](packages/shared/AGENTS.md): shared schemas, money rules, sync contracts
