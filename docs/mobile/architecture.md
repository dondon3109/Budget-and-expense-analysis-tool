# Native mobile architecture

## Verified baseline

The repository is a pnpm monorepo with React/Vite in `apps/web`, a Hono Cloudflare Worker in `apps/api`, tenant-isolated financial data in D1, Supabase Auth for identity/session management, approved avatar responsibilities in Supabase Storage, reusable TypeScript in `packages/shared`, and the signed Android TWA in `apps/android`.

The native application is additive under `apps/mobile`. It does not replace a production surface during development.

```mermaid
flowchart LR
  UI[Expo Router screens] --> Repos[Typed mobile repositories]
  Repos --> Local[(SQLCipher SQLite)]
  UI --> Session[Supabase Auth session]
  Sync[Sync coordinator] --> Local
  NetInfo[NetInfo reachability hint] --> Sync
  Background[Expo background task] --> Sync
  Sync -->|Bearer token, push/pull batches| Worker[Existing Hono Worker]
  Worker -->|verify JWT and derive tenant| Supabase[Supabase Auth/JWKS]
  Worker --> D1[(D1 server record)]
  Shared[packages/shared] -. schemas and pure calculations .-> UI
  Shared -. contracts .-> Worker
```

## Ownership boundaries

| Concern                                                                    | Owner                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Identity, access/refresh tokens, OAuth, password recovery                  | Supabase Auth, persisted through a SecureStore-backed adapter       |
| Authorization, tenant derivation, ownership, plan enforcement, rate limits | Worker                                                              |
| Server financial record and cross-device ordering                          | D1 through Worker repositories                                      |
| On-device financial rendering and durable offline work                     | User-scoped SQLCipher database                                      |
| Temporary presentation and workflow composition                            | Small Zustand stores                                                |
| Connectivity indication                                                    | NetInfo hint plus actual Worker result                              |
| Themes and reusable mobile components                                      | Mobile design tokens/primitives; NativeWind is only a utility layer |

## Mobile modules

- `app/`: Expo Router public and authenticated groups, stacks, tabs, callbacks, and platform-specific routes.
- `src/auth/`: Supabase client, SecureStore session adapter, lifecycle refresh, identity transition coordinator.
- `src/db/`: SQLCipher open/key lifecycle, migrations, repositories, observable query invalidation, recovery states.
- `src/sync/`: outbox, push/pull transport, retry classifier, cursor application, conflict materialization, background entrypoint.
- `src/api/`: bearer-aware Worker client, Zod decoding, typed error normalization, no arbitrary URL surface.
- `src/domain/`: React Native-safe shared exports and mobile-only orchestration types.
- `src/features/`: vertical feature modules that depend on repositories rather than holding financial records in component state stores.
- `src/stores/`: small UI-only Zustand stores with selectors and validated/versioned allowlisted persistence.
- `src/ui/`: tokens, themes, primitives, financial formatting, accessibility helpers, and product components.
- `src/config/`: runtime-validated public configuration and app-variant metadata.

## Application variants

| Variant     | Android package                | Proposed iOS bundle ID     | Purpose                                                                                       |
| ----------- | ------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------- |
| Development | `site.zoption.android.dev`     | `site.zoption.ios.dev`     | Local development build with developer tooling                                                |
| Preview     | `site.zoption.android.preview` | `site.zoption.ios.preview` | Internal distribution against non-production configuration                                    |
| Production  | `site.zoption.android`         | `site.zoption.ios`         | Eventual store build; identifiers are not registered or used for replacement without approval |

The final iOS bundle identifier is a proposal only. Variant selection must be build-profile controlled and validated at config load.

## Navigation shape

- Root stack owns startup, public auth flow, callbacks, recovery, and authenticated shell.
- Authenticated tabs prioritize Home, Transactions, Budgets, and Plan; less-frequent surfaces live under a native More/settings stack.
- iOS and Android may use platform-specific toolbar, sheet, back, and tab behavior while sharing feature components.
- Route guards redirect for interface coherence only. Every Worker request still authenticates and authorizes independently.

## Data access rules

- Financial screens query SQLite first and subscribe to repository invalidation.
- A mutation validates, writes the local record and outbox transaction atomically, then updates the UI.
- Sync acknowledgement changes local sync metadata; NetInfo never marks work synchronized.
- API payloads and persisted rows are decoded with Zod before use.
- Tokens, tenant identity, financial entities, outbox rows, and plan entitlement never enter Zustand or AsyncStorage.
- Identity change closes the old database, clears in-memory repositories/query observers, and opens a subject-derived workspace only after the key is resolved.
- A restored Supabase session opens only the immutable-subject-scoped encrypted workspace, allowing
  cached financial screens to render offline. The independent `/api/app/me` assertion must confirm the
  Worker-derived user and tenant before synchronization starts. An identity mismatch signs out the
  session while preserving the encrypted workspace for deliberate recovery.
- Startup migrations use the keyed connection's regular transaction. Expo's exclusive transaction helper creates another native connection and therefore cannot be used unless that connection is separately keyed.
- D1 owns cross-device ordering through tenant-scoped integer sequences. Database triggers attach
  existing web/API writes to immutable mobile change rows, while the authenticated pull route exposes
  only the middleware-derived tenant. The mobile cursor is progress metadata, never authorization.
- Pull application and cursor advancement share one keyed local transaction. Financial observers are
  invalidated only after commit, so the interface cannot render or label a partial page as synchronized.

## Development-build requirement

SQLCipher, native authentication capabilities, background tasks, and release-representative behavior require Expo development builds. Expo Go may be useful for no proof claimed here and is not part of the production validation path.

## Compatibility decision

- Expo SDK 57 is the current stable SDK line and targets React Native 0.86/React 19.2.
- NativeWind 4.2.6 is the stable production line. NativeWind 5 remains preview and is excluded.
- React Native New Architecture is mandatory in React Native 0.86. Expo SDK 57 no longer accepts the legacy `newArchEnabled` toggle, so there is no opt-out configuration to carry.
- Package versions are exact-pinned in `apps/mobile/package.json`; the workspace lockfile is the reproducibility authority.
