# Agent guidance

Don prefers complex systems to be implemented as simply as possible. Keep changes scoped, type-safe, and supported by focused tests. Be cautious with destructive actions, keep useful comments current, and treat questions as read-only requests unless Don explicitly asks for implementation.

## Commits and releases

When asked to commit, inspect the actual change and use a Conventional Commit subject:

- `feat(scope): ...` for a new user-facing capability; this triggers a minor release.
- `fix(scope): ...` for a bug fix; this triggers a patch release.
- `feat(scope)!: ...` or a `BREAKING CHANGE:` footer for an incompatible change; this triggers a major release.
- `docs:`, `test:`, `chore:`, `refactor:`, `style:`, `ci:`, and `build:` for non-releasing work of those types.

Use an imperative, concise summary and an optional scope when it adds useful context. Do not label maintenance work as `feat` or `fix` merely to force a release.

Do not manually edit product version numbers during normal development. Semantic-release determines the next Git tag and GitHub Release from commits after CI passes. Android and native mobile package versions remain separate release artifacts and should change only as part of their explicit signed-app release process.

Do not deploy the production Worker or Pages app manually during normal development. The `Production Release` workflow owns D1 migration, Worker deployment, versioned Pages deployment, smoke verification, and semantic-release publication after CI. Manual production commands are emergency recovery operations and must never run concurrently with that workflow.

Keep `CHANGELOG.md` current for every release. Record notable user-facing changes under `Unreleased` before release, then, after semantic-release succeeds, move those entries under the exact released version and date in a follow-up, non-releasing `docs:` commit. Do not guess the next version or mark a failed release as published.

Check for stale patch list notes on production when releasing. Make sure to update the patch list as needed before releasing.

When releasing new changes however small it may be, always treat it as a new version both in web and mobile. Hence, always bump the version on mobile releases.

## Documentation

- Keep a document current in the same change that makes it stale. A change that moves a command, a configuration value, an environment binding, or an external service setting is not finished until the document that owns that fact matches it.
- Record external state, not only code. What is configured in the Supabase, Cloudflare, PayPal, and Resend dashboards is invisible in the repository, so `docs/deployment.md` states what is actually configured and how to read it back.
- Do not leave a setting as tribal knowledge. If a future session would need a dashboard login to learn a value this project depends on, write it down.
- A line that only narrates what a commit did is churn. Record facts that stay true.

## Working style

- Do not spawn subagents for work a single agent can complete in one pass.
- If parallel agents are justified, assign non-overlapping file ownership first.
- Prefer focused tests over broad, repetitive regression suites.
- If a request is phrased as a question, answer it without editing files and offer implementation separately.

## Implementation

- Write the smallest change that preserves behavior and contracts. Prefer fewer new files, types, hooks, and wrappers.
- Correctness outranks brevity. Do not remove boundary validation, fail-closed auth, tenant scoping, integer-money handling, or sync/outbox atomicity to shorten code. See `docs/maintainability.md`.
- Protect boundaries, streamline internals. Validate at I/O (HTTP bodies, env, storage, third-party APIs, user input). After schema/type validation, do not repeat the same null/shape checks in internal code.
- Subtraction over addition. When replacing logic, delete the old path instead of wrapping it. Do not delete adjacent error or compatibility handling you have not verified as dead.
- Do not add single-use wrappers, adapter types, or helper functions for logic used once. Extract only when the logic is reused, independently testable, or makes a domain rule obvious.
- In UI code, derive values during render. Do not add extra `useState` plus a sync `useEffect` to copy props or query data. Keep effects for subscriptions, one-time setup, imperative APIs, and true external synchronization.
- Prefer early returns over nested `if/else`. Do not replace clear domain branches with clever maps or dense ternaries.
- Comments explain constraints and non-obvious why. Do not add comments that only narrate the next line. Keep existing useful comments current.
- Match the local file’s style. Do not introduce a new abstraction layer for a one-off change.

## Design Preferences

- Prefer not to use gradient coloring on card, floating card and backgrounds

## Stack

- **Language / Runtime**: TypeScript on Node 22+, Cloudflare Workers, and Expo (React Native)
- **Framework**: React 19 + Vite (web), Hono (Worker API), expo-router (mobile)
- **Key dependencies**: `@zoption/shared` (zod schemas and domain rules), TanStack Query, Drizzle schema over Cloudflare D1, Supabase Auth, Wrangler
- **Package manager**: pnpm 11 workspaces (`apps/*`, `packages/*`; `apps/stt-bridge` excluded)

## Build approach

Tracer Bullet: each feature runs end to end through every layer and works, then widens. Recorded in `docs/scope/web/scope.md`.

## Context files

- [apps/api/AGENTS.md](apps/api/AGENTS.md): Worker API, D1, tenancy, and the sync protocol
- [apps/web/AGENTS.md](apps/web/AGENTS.md): browser app, public routes, prerender, and CSP
- [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md): Expo client, local workspace, outbox, and Android releases
- [packages/shared/AGENTS.md](packages/shared/AGENTS.md): shared schemas, money rules, and sync contracts
- [apps/ads/AGENTS.md](apps/ads/AGENTS.md): Remotion ad renderer (frozen)
