# Scope: Zoption monorepo

Zoption is a privacy conscious budgeting product for people who want to understand their money without handing a bank their login. This file maps the scope for each workspace in the repo. Planning and building happen inside a workspace scope, never here.

| Workspace         | What it is                                                          | Scope                        | Rollup              |
| ----------------- | ------------------------------------------------------------------- | ---------------------------- | ------------------- |
| `apps/web`        | The browser product: the public site plus the signed in app         | [web/scope.md](web/scope.md) | 16 built, 3 planned |
| `apps/api`        | The Cloudflare Worker: tenant data, sync, billing, assistant, admin | not scoped yet               |                     |
| `apps/mobile`     | The Expo native client for Android and iOS                          | not scoped yet               |                     |
| `packages/shared` | Shared domain rules and types used by every app                     | not scoped yet               |                     |
| `apps/ads`        | Remotion ad renderer, frozen until a campaign needs it              | not scoped yet               |                     |
| `apps/stt-bridge` | Cloud Run speech bridge, frozen and unshipped                       | not scoped yet               |                     |

Work that crosses apps belongs in a `_root` scope, which does not exist yet. Run `/scope <workspace>` to add one workspace at a time, or `/scope` with no argument to reconcile the scopes you already have.
