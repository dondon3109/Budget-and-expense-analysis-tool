# Native mobile milestone status

Last updated: 2026-08-16.

| Milestone                            | Status      | Exit evidence                                                                                                                |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0. Discovery and design              | Complete    | Verified repository/worktree baseline, parity matrix, architecture, sync protocol, threat model, shared compatibility review |
| 1. Mobile foundation                 | Complete    | Native Android/iOS development builds, iOS runtime navigation/input, themes/components, focused tests                        |
| 2. Authentication and shell          | In progress | Real Supabase session and Worker-derived tenant verified on iOS; social auth and Android runtime remain                      |
| 3. Encrypted local database          | In progress | iOS SQLCipher file/reopen proof, migrations, observable repository, and guarded sign-out implemented                         |
| 4. Transaction sync vertical slice   | In progress | Account/category/transaction offline push, restart durability, and explicit conflict recovery proven on iOS                  |
| 5. Core budgeting                    | In progress | Local-first dashboard/budgets/cash flow/search with semantic parity                                                          |
| 6. Planning and recurring money      | Complete   | Goals, debts (avalanche/snowball), subscriptions, calendar, fee-aware transfers, and savings-interest modeling proven with tests |
| 7. Imports                           | Complete   | Native selection, explicit preview, duplicate prevention, atomic commit                                                      |
| 8. Online-only capabilities          | Complete   | Assistant/voice/billing/support/account management with online/consent boundaries; 40 new mobile tests, iOS dev build proof  |
| 9. Hardening and release preparation | Not started | Accessibility, performance, resilience, signed-test authorization, upgrade/rollback documents                                |

## Milestone 0 verified baseline

- Main checkout `/Users/dondon/Projects/Budget-and-expense-analysis-tool` was clean and aligned with fetched `origin/main` at `c533706`.
- Existing `/Users/dondon/Projects/zoption-mobile` worktree on `create-mobile-app` was clean and left untouched.
- Requested worktree `/Users/dondon/Projects/Budget-and-expense-analysis-tool-mobile` was created on `codex/expo-mobile` from current `origin/main`.
- No repository `AGENTS.md` file was present; the instructions supplied by Don govern this run.
- The current API lacks general financial sync revisions, deletion tombstones, a tenant change cursor, client-generated IDs, and push/pull batch routes. Milestone 4 therefore requires deliberate Worker/D1/shared changes.

## Foundation compatibility risks

- Expo SDK 57 is current stable. Expo SDK 58 canary is excluded.
- NativeWind 4.2.6 is stable; NativeWind 5 preview is excluded. NativeWind bundled and rendered in the iOS development build.
- `expo-sqlite` supports SQLCipher through native config and is unavailable as meaningful proof in Expo Go.
- Background task timing is controlled by Android/iOS; iOS Simulator cannot execute the production background scheduler.
- The machine has Xcode and iOS 26.5 simulators. Homebrew OpenJDK 17 and the Android SDK work when their paths are exported explicitly. No Android device, emulator binary, or system image is installed, so Android execution remains a host-test gap despite a successful APK build.
- Final Apple bundle registration, associated domains, Sign in with Apple capability, and store credentials require explicit external approval/configuration later.

## Existing production impact

None. All mobile, shared-contract, Worker, and migration work exists only in the isolated worktree. It does not modify the main checkout, production Worker or D1, Supabase project, Pages site, TWA, store records, or deployed artifacts.

## Milestone 1 evidence

- Exact-pinned Expo SDK 57, React Native 0.86, Expo Router, stable NativeWind 4.2.6, Zustand, NetInfo, SQLCipher-enabled `expo-sqlite`, SecureStore, BackgroundTask, and Zod are installed through the workspace lockfile.
- Development, preview, and production variants use distinct identifiers. Production identifiers are reserved proposals only; no store or EAS project was registered.
- Reusable Light, Dark, and Coffee tokens plus the required mobile primitives are implemented. Zustand contains UI preference/workflow state only.
- Expo Doctor passed 20/20 checks. TypeScript, ESLint, and four focused Jest suites passed.
- iOS: a Debug development app built in 276.7 seconds from a fresh native build, installed and launched on an iPhone 17 Pro simulator, bundled successfully, rendered the welcome/sign-in screens, exposed semantic controls, navigated, and accepted text input. The generated simulator app was 132 MB; this is not a release-size result.
- Android: `assembleDebug` succeeded for all four debug ABIs in 13m39s after first-time SDK/NDK setup. The universal development APK was 263 MB and identified as `site.zoption.android.dev`; this is not a release-size result.
- Android artifact inspection found SQLCipher entry points (`exsqlite3_key`, `cipher_version`) in `libexpo-sqlite.so`. Generated native configuration also has `newArchEnabled=true`, `expo.sqlite.useSQLCipher=true`, and `android:allowBackup=false`.
- iOS generated build flags include `SQLITE_HAS_CODEC=1` and `SQLCIPHER_CRYPTO_CC`, and the built app reports `RCTNewArchEnabled=true` with bundle ID `site.zoption.ios.dev`.

## Milestone 1 known gaps

- SQLCipher is linked but no financial database, key lifecycle, migration, repository, or encryption-at-rest claim is made before Milestone 3.
- Background-task packages are linked but no sync task is registered before the Milestone 4 protocol exists.
- Android execution is unverified because this host has no connected device or installed emulator/system image. The APK build is valid compile/package proof, not runtime proof.
- Debug artifact size and first-build duration are recorded only as setup evidence. Release performance and size budgets remain a Milestone 9 measurement.

## Milestone 2 progress

- Email/password sign-in now calls the existing Supabase project from the native app. The session
  lifecycle uses PKCE, app-active token refresh, and a chunked SecureStore adapter with
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; no token is stored in Zustand or AsyncStorage.
- Invalid credentials were submitted from an iPhone 17 Pro Simulator and received the expected
  server rejection, rendered as the accessible `Email or password is incorrect.` error. This proves
  the button, network request, loading state, and error path without using or exposing a real account.
- Password-reset request, callback code exchange, and update-password routes are implemented. The
  development callback is `zoption-dev://auth/callback`; end-to-end email-link proof still depends on
  the external Supabase redirect allow-list.
- Identity transitions clear temporary user-scoped UI state. Safe sign-out now attaches encrypted
  workspace inspection and cleanup to the same boundary before financial records exist locally.
- Focused tests cover validation and large/corrupt/remove cases for encrypted session persistence.
- A real existing Zoption account signed in on the iPhone simulator. The native app then called the
  production Worker `/api/app/me` route with its refreshed bearer session. The Worker response matched
  the immutable Supabase subject and the server-derived `user:<subject>` tenant convention before the
  authenticated tabs rendered. No financial records were fetched or logged during this proof.

## Milestone 2 remaining gaps

- The authenticated identity/tenant boundary is proven, but same-workspace financial-record parity
  remains a Milestone 4 sync proof because the current Worker has no mobile push/pull protocol.
- Google social authentication and Sign in with Apple are not implemented yet. Provider dashboard,
  Apple capability, universal/app links, and verified account-linking proof remain.
- Android authentication runtime proof remains blocked by the host's missing emulator/device.

## Milestone 3 progress

- A 256-bit random SQLCipher passphrase is generated with `expo-crypto` and stored only in
  device-only SecureStore under an opaque subject-derived alias. Invalid protected-key material fails
  closed and is not replaced automatically.
- The database is opened on a dedicated connection, keyed before schema access, checked for an active
  SQLCipher runtime, and bound to the exact immutable Supabase subject inside encrypted metadata.
- Schema version 1 creates accounts, categories, transactions, the durable outbox, conflicts,
  tombstone/revision fields, cursor metadata, foreign keys, and duplicate-import protection in one
  startup transaction. Expo's exclusive helper was deliberately rejected because it creates a second
  unkeyed native connection under SQLCipher.
- Schema version 2 adds immutable outbox base snapshots and retained sync tombstones for pull
  conflict/deletion handling. Schema version 3 enforces one active outbox operation per entity so
  unsent edits coalesce without duplicating logical mutations. All versions use the keyed connection and transactional
  migration boundary.
- Typed repository results are Zod-decoded. Aggregate local state is observable through SQLite change
  events without placing financial records in Zustand or AsyncStorage.
- On iPhone 17 Pro Simulator, the real authenticated session created schema version 1, rendered the
  encrypted-workspace state, stopped, relaunched, reopened with the protected key, and rendered again.
- After the app closed, the database was 94,208 bytes, identified as generic data rather than SQLite,
  rejected by plaintext `sqlite3` with `file is not a database`, and exposed no plaintext schema or
  identity markers through `strings`.
- An actual failed migration attempt preserved its encrypted file and surfaced a recovery state. Unit
  tests also prove version ordering, newer-schema refusal, and failure propagation.
- Sign-out now inspects durable outbox/conflict counts before Supabase local sign-out. The native
  confirmation dialog warns before any deliberate discard; successful safe sign-out removes the
  subject database and its key only after the auth operation succeeds. Expired remote sessions preserve
  the encrypted workspace for recovery.

## Milestone 3 remaining gaps

- The destructive end of sign-out cleanup is policy/unit-tested but was not executed against the only
  available real simulator session, because doing so would remove that session and prevent continued
  authenticated development without the user's password.
- Android SQLCipher runtime/reopen proof still needs a device or emulator. A fresh development APK
  compile with autolinked `expo-crypto` and SQLCipher passed 736 Gradle tasks in 21m06s; this is native
  compile/package evidence, not runtime encryption proof.
- Android backup is disabled in generated configuration and database keys are device-only. A fixed
  local Expo module now applies and reads back iOS `isExcludedFromBackup` before SQLite opens. The
  rebuilt simulator app rendered and the directory exposed Apple's backup-exclusion extended attribute.

## Milestone 4 progress

- Shared protocol-version-1 schemas strictly bound pull and future push payloads. They reject tenant
  ownership fields, non-UUID mobile creates, duplicate/self-dependent operations, oversized batches,
  malformed cursors, and transfers submitted as non-atomic transaction creates.
- D1 migration `0034_mobile_sync_foundation.sql` adds row revisions, tenant-scoped monotonic sequences,
  immutable change payloads, tombstones, and tenant/client/idempotency storage. Existing rows are
  deterministically bootstrapped into the change log.
- Database triggers bring existing web/API account, category, transaction, transfer-leg, import, and
  scheduled writes into the same revision/change stream without changing their public response shapes.
- Authenticated `POST /api/app/sync/pull` derives the tenant from middleware, accepts no tenant ID,
  returns at most 200 ordered changes, and uses an opaque canonical cursor. A cursor ahead of server
  state fails with `full_resync_required` instead of silently accepting data loss.
- Focused in-memory SQLite behavior proves bounded pagination, tenant isolation, server-derived category
  locks, web-write revision increments, transaction tombstones, and safe tenant cascade deletion.
- The mobile transport calls only the fixed `/api/app/sync/pull` route, sends no tenant identifier,
  bounds responses to 512 KiB, Zod-decodes the shared contract, and classifies authentication,
  deletion, full-resync, rate-limit, retryable, and invalid-response failures.
- Pull pages are applied to SQLCipher in one transaction with the cursor. Account, category,
  transaction, and deletion-tombstone revisions reject stale changes; unsynchronized overlapping
  local rows stop as explicit conflicts rather than being overwritten.
- Foreground synchronization uses NetInfo only as a hint, refreshes an expired token once, limits
  page count and request duration, and never shows `Up to date` before the local transaction commits.
  Financial screens subscribe to repositories and render their encrypted copy before network work.
- On iPhone 17 Pro Simulator, an existing Supabase session authenticated to an isolated local Worker,
  pulled three accounts, eleven categories, and a synthetic transaction from local D1, committed the
  cursor/rows into SQLCipher, and rendered the transaction with its category and peso amount. The
  Worker and app process were then stopped; relaunch still rendered the cached counts and transaction
  while honestly reporting synchronization unavailable. No production D1 or deployment was touched.
- Focused mobile tests cover transport/error bounds, migration 2, atomic cursor application,
  rollback on invalid dependencies, retained tombstones, local-conflict refusal, restart persistence,
  and repository transaction mapping. Thirteen suites and 42 tests pass.
- Shared push-result contracts now distinguish acknowledgement, durable rejection, and conflicts with
  validated current-server snapshots. The first Worker push slice handles dependency-free,
  non-transfer transaction create/update/delete with client UUIDs and exact base revisions.
- D1 mutation, revision/change-log trigger, and the tenant/client/idempotency acknowledgement execute
  in one batch. Identical retries replay the stored result; a reused key with different content is
  rejected. Focused SQLite tests prove create replay, key misuse rejection, stale-edit preservation,
  tenant derivation, and revisioned deletion tombstones.
- A shared local writer serializes financial writes on the keyed SQLCipher connection. Native
  non-transfer create, update, and delete now commit the local projection and encrypted outbox row in
  one transaction. Unsent edits coalesce; an unpushed create/delete pair cancels locally; once an
  operation has been attempted its idempotency payload is immutable and restart replays it unchanged.
- Foreground synchronization now drains bounded push batches before pulling. Acknowledgements update
  the local server revision and remove the outbox row atomically; retryable failures persist bounded
  full-jitter backoff; permanent failures stay visible; conflicts retain base, local, and server
  versions without allowing the following pull to overwrite them.
- The native transaction stack supports create/edit entry, integer-minor-unit amount validation,
  active local account/category selection, durable-write-before-navigation, pending/failed/conflict
  labels, and explicit deletion confirmation. The later atomic-transfer slice extends the same stack
  without treating either transfer leg as an independent user operation.
- Conflict review shows the preserved device and server financial versions. Choosing the server
  applies that validated snapshot locally; choosing the device creates a fresh idempotency key and
  revision-aware operation based on the preserved server revision. Both resolutions close the prior
  conflict and outbox reference in the same SQLCipher transaction.
- The Worker accepts dependency-free account and category create/update/archive commands with
  client UUIDs, exact revisions, idempotent acknowledgements, tenant-scoped snapshots, permanent-row
  protection, and case-insensitive name checks. Category creation and restore keep the current atomic
  Free/Pro allowance logic; archive commands intentionally produce upserts to match the existing web
  product.
- One connected create graph may atomically add account/category roots and dependent non-transfer
  transactions. The client records exact operation dependencies, never splits or mixes the graph,
  and prevents cancelling a referenced parent. The Worker validates dependency order and exact
  references, preflights tenant-owned relationships and entitlements, then commits every mutation and
  idempotency acknowledgement in one guarded D1 batch. Any failure rolls back the entire graph;
  otherwise-valid siblings receive `dependency_failed` rather than a false acknowledgement.
- Native Money setup now lists observable encrypted accounts/categories and provides touch-safe
  create, edit, and confirmed archive sheets. Every mutation commits its local projection and outbox
  row together. A pending, never-attempted account or category is visibly marked as pending setup and
  may be used immediately by a transaction that joins its atomic dependency graph.
- On iPhone 17 Pro Simulator, a synthetic account was created with the isolated Worker stopped and
  remained pending after full process termination/relaunch. Reconnect acknowledged revision 1 in
  local D1. The same row was archived offline, survived another process restart, and reconnect
  acknowledged the existing product's archive-upsert behavior at revision 2. No remote D1,
  deployment, production checkout, or Android TWA was changed. A reset isolated Worker cursor also
  remained visibly in full-resync recovery; the app did not clear the encrypted workspace to hide it.
- On iPhone 17 Pro Simulator, a synthetic expense was saved while the isolated local Worker was down,
  rendered as pending, and survived full app-process termination. After reconnect, the same outbox
  operation received `POST /api/app/sync/push` 200 followed by pull convergence; a subsequent native
  edit completed a second push/pull cycle and the pending label cleared only after acknowledgement.
- A second iOS adversarial run saved a device edit offline, changed the same row independently in
  local D1, and produced a visible conflict after reconnect. The native review sheet showed both
  versions; “Keep mine” generated a new operation against the newer server revision, received push
  and pull `200` responses, and returned to `Up to date` only after acknowledgement.
- A category adversarial run saved “Device dining conflict” offline while the isolated Worker was
  stopped, then independently changed the same local D1 row to “Server dining conflict” at revision 2.
  Reconnect preserved both versions and marked the row `Needs review`. The native review sheet exposed
  both names and colors; choosing the device version queued a new idempotent operation against revision
  2, which the Worker acknowledged as revision 3. A full app-process termination/relaunch retained the
  resolved local row without a pending or conflict label. No remote D1 or production service changed.
- An iOS dependency-graph run created “Atomic proof wallet,” “Atomic proof category,” and a synthetic
  ₱321 expense with the isolated Worker stopped. All three encrypted local rows survived full process
  termination. Reconnect produced one authenticated push and pull; isolated D1 showed all three at
  revision 1 with three idempotency acknowledgements, and the native pending labels cleared only after
  the Worker response. No remote D1 or production service changed.
- Atomic transfer protocol version 1 now represents a linked pair as one logical outbox operation.
  D1 owns immutable group membership, guarded create/update/delete batches, revision-aware logical
  snapshots, and pull boundaries that cannot split a pair. SQLCipher commits both local legs and the
  outbox state together; the native form supports distinct source/destination accounts, optional fees,
  net-received preview, linked editing/deletion, and explicit device/server conflict resolution.
  Focused tests cover fee math, idempotent replay, second-leg collision rollback, limit-one pull,
  cursor-inside-pair refusal, malformed legacy-pair isolation, stale conflicts, both-leg local
  durability, and conflict resolution.
- On iPhone 17 Pro Simulator, a synthetic ₱432.10 transfer with a ₱2.10 fee was saved while the
  isolated Worker was stopped. Both encrypted legs and the single outbox operation survived a full
  app-process termination. Reconnect acknowledged both rows at revision 1 and removed the pending
  label only afterward. A native edit to ₱500 with a ₱5 fee converged both legs at revision 2; isolated
  D1 showed one immutable group and balanced sender/receiver amounts. No remote D1, deployment, or
  production service changed.
- Sixteen mobile suites with 74 focused tests pass. Repository-wide ESLint/typecheck and all 148
  Vitest files with 1,053 tests pass. A fresh local D1 applied all 37 migrations. Worker dry-run
  packaging is 1,433.03 KiB raw / 261.14 KiB gzip; production-mode exports complete in 21.21 seconds
  for iOS (9.5 MiB total, 5.7 MB reported Hermes bundle) and 18.34 seconds for Android (11 MiB total,
  5.9 MB reported Hermes bundle). These are bundle export measurements, not signed archive or
  installed-device size claims.
- The mobile full-resync path now streams the Worker's fixed-sequence snapshot into a new encrypted
  generation beside the current database, applies validated account/category/transaction upserts on the
  keyed SQLCipher connection, records the resumed incremental cursor, verifies referential and
  transfer-pair integrity plus subject/client identity and the absence of retained outbox work, then
  atomically switches the generation pointer before deleting the superseded copy. The full-resync
  coordinator path performs this recovery and reopens the encrypted workspace. Transport and
  generation-builder/verification logic are covered by focused Jest suites (17 suites, 91 tests).

## Milestone 4 remaining gaps

- Atomic transfers now have automated local/D1 and full native iOS reconnect/process-restart proof.
  Android runtime proof still requires a device or installed emulator/system image.
- Tenant-scoped client acknowledgement, a 90-day cursor-retention floor, resumable fixed-sequence
  server snapshots, and guarded daily change/tombstone compaction are implemented and focused-tested.
  The mobile beside-the-current-database snapshot builder, verification, and atomic generation switch
  are implemented and unit-tested; the encrypted generation switch still needs an on-device iOS/Android
  runtime proof (the host lacks an Android emulator/device, and the iOS simulator path awaits the next
  development build) before release.
- Migration performance has only been exercised on fresh/local SQLite data; production-scale migration
  timing and rollback rehearsal are pending and no D1 migration has been deployed.
- `apps/mobile` intentionally targets Android and iOS. A combined Expo export that also requests web
  fails because the pnpm-installed Expo SQLite package does not contain its optional web WASM asset;
  the required standalone iOS and Android exports pass, and responsive web remains owned by `apps/web`.

## Milestone 5 progress

- The Home tab is now a local-first dashboard rendered entirely from the encrypted ledger. It shows
  overall and per-account balances (computed with the Worker transfer-leg exclusion rule), the
  current-month money-in/out/net/savings-rate summary, spending by category with accessible text+bar
  alternatives, a seven-day weekly cash-flow view, and an empty budget card pending budget sync.
- LocalWorkspaceRepository.getDashboardData maps transactions, accounts (with ledger-computed
  balanceMinor / balancesByCurrency matching the apps/api accountSelection SQL), and empty budgets; it
  reuses shared summarizeAccountBalances, buildDashboardSummary, and buildCashflowTrend.
- LocalWorkspaceRepository.queryTransactions adds parameterized local search (literal substring via
  instr/lower, no wildcard injection) and a kind filter, reusing the shared transfer-leg projection.
  listTransactions now delegates to it.
- The Transactions tab now has a search field and All/Income/Expense/Transfer filter chips with distinct
  empty states. useLocalTransactions accepts search and kind and re-queries on change.
- Eighteen mobile suites with 97 focused tests pass; typecheck and lint are clean.
- Monthly budgets are now a full vertical slice. D1 migration `0038_mobile_sync_budgets.sql` adds
  budget revisions, a `mobile_sync_budget_rows` view, change-log triggers, and an upsert-only
  (month, category) budget model that mirrors the web product's no-delete semantics. The Worker push
  slice validates active expense categories and returns the existing budget snapshot for a duplicate
  (month, category) create.
- The mobile budget repository mirrors the Worker semantics: active expense category only, unique
  (month, category), no delete, and update changes only the limit. Offline create/update queue through
  the encrypted outbox; `getBudgetMonth` computes per-category spent totals with the same
  expense-only aggregation as the dashboard.
- The Budgets tab renders a month navigator, summary totals, per-category progress bars, and a
  touch-safe editor sheet. Budget conflicts are preserved (never silently overwritten): a duplicate
  create surfaces the existing server budget, a stale update surfaces the current server revision, and
  a dedicated review screen offers "keep this device limit" (re-queued against the server revision) or
  "use server limit" (snapshot applied locally). Pending/failed/conflicted rows are labeled honestly.
- Twenty mobile suites with 111 focused tests pass; shared (98) and API mobile-sync (34) tests pass;
  typecheck, lint, and a standalone iOS Hermes export bundle all succeed.
- The current code (including the budget conflict screen and the fixed shared push-response schema)
  builds and launches natively on an iPhone 17 Pro simulator: xcodebuild succeeded, the app installed
  and opened as `site.zoption.ios.dev`, Metro bundled 2073 modules in ~2.7s, and no runtime error or
  redbox appeared. This re-verifies the on-device build path after the budget work; an authenticated
  dashboard/budgets interaction run remains the next on-device proof.
- Pro-gated cash-flow views are implemented. `readPlan` decodes the server-authoritative plan from
  the billing summary; `usePlan` caches it in memory keyed by the immutable subject and clears it on
  every identity transition (never persisted, never in Zustand). The Home tab adds a 7-day / Month /
  6-month selector; Month and 6-month are locked behind Pro and an unknown or unreachable plan always
  fails closed to the Free 7-day view. The server still enforces the Pro gate on its own cash-flow
  trend route.
- Remaining Milestone 5 work: an authenticated on-device interaction run of the dashboard/budgets
  rendering (the iOS build/launch path is proven; signed-in rendering with real records is not yet
  re-exercised after the latest screens). Android runtime proof remains a host gap.

## Milestone 6 progress

- Financial goals are now a full vertical slice. D1 migration `0039_mobile_sync_goals.sql` adds a
  `revision` column to `financial_goals`, rebuilds the mobile change log to include `'goal'` in the
  entity-type check (copy-then-rename to preserve triggers), creates a `mobile_sync_goal_rows` view,
  bootstraps existing goals with deterministic per-tenant revisions, and adds insert/update/delete
  triggers whose delete emits a `OLD.revision + 1` tombstone guarded by tenant existence.
- The Worker push slice validates goals through the shared `mobileSyncGoalInputSchema` (name 1–80
  trimmed characters, `targetAmountMinor` 1..9e14, `currentAmountMinor` 0..9e14, ISO target date,
  status, and current<=target) and `mobileSyncGoalUpdateSchema` (all optional, at least one). A create
  with a duplicate name is a durable `invalid_operation` rejection (mirroring web 409
  `financial_goal_exists`, not the budget-style `entity_exists`); an update with a stale revision is
  a `stale_revision` conflict; a missing goal is `entity_missing`. Name uniqueness is enforced
  case-insensitively on the sync boundary, which is deliberately stricter than the web product's
  case-sensitive index and fails closed.
- Local schema version 7 adds `financial_goals` and rebuilds the outbox, conflict, and tombstone
  entity-type checks to include `'goal'`. Pull applies goal upserts and deletion tombstones into the
  table; the push layer sends goal create/update/delete through the encrypted outbox.
- Offline goal mutations mirror Worker semantics: create returns a client UUID, enforces local
  case-insensitive name uniqueness and current<=target, updates send full merged values, and delete
  soft-deletes a synced row (or cancels an unpushed create). Conflicts are preserved and resolved
  without device-clock arbitration: keep-local re-queues against the preserved server revision and
  keep-server applies the validated server snapshot (or removes the row when the server deleted it).
- The Goals screen lists active/paused/completed goals with progress bars and honest pending/failed/
  conflict labels; a goal editor provides name, target, saved-so-far, target date, and status fields; a
  conflict screen shows device and server versions with explicit resolution. A `Savings goals` entry
  on the More tab reaches the stack, and the three routes are registered with native headers.
- Twenty-two mobile suites with 130 focused tests pass; typecheck and lint are clean, and a standalone
  iOS Hermes export succeeds. No remote D1, deployment, or production service was changed.
- Debts are now the second Milestone 6 vertical slice. D1 migration `0040_mobile_sync_debts.sql` adds a
  `revision` column to `debts`, rebuilds the mobile change log to include `'debt'` in the entity-type
  check, creates a `mobile_sync_debt_rows` view, bootstraps existing debts with deterministic
  per-tenant revisions, and adds insert/update/delete triggers whose delete emits a
  `OLD.revision + 1` tombstone guarded by tenant existence.
- The Worker push slice validates debts through the shared `debtInputSchema` (name 1–80 trimmed
  characters, `balanceMinor` 1..9e14, APR 0..100%, `minimumPaymentMinor` 0..9e14, ISO
  balance-as-of date, status) and `debtUpdateSchema` (all optional, at least one, balance may reach
  zero to pay off). A create with a duplicate name is a durable `invalid_operation` rejection; a stale
  update is `stale_revision`; a missing debt is `entity_missing`. Name uniqueness is case-insensitive
  on the sync boundary, deliberately stricter than the web product's case-sensitive index.
- Local schema version 8 adds `debts` and rebuilds the outbox, conflict, and tombstone entity-type
  checks to include `'debt'`. Pull applies debt upserts and deletion tombstones; the push layer sends
  debt create/update/delete through the encrypted outbox.
- Offline debt mutations mirror Worker semantics: create returns a client UUID and enforces local
  case-insensitive name uniqueness; updates send full merged values including a zero-balance payoff;
  delete soft-deletes a synced row (or cancels an unpushed create). Conflicts are preserved and resolved
  without device-clock arbitration, exactly like goals.
- The Debts screen lists active/paid debts with type, APR, minimum payment, and honest pending/failed/
  conflict labels, plus an avalanche/snowball payoff planner that reuses the shared
  `calculateDebtPayoff` model with an optional extra monthly payment. A debt editor provides name,
  type, balance, APR, minimum payment, balance-as-of date, and status fields; a conflict screen shows
  device and server versions with explicit resolution. A `Debts` entry on the More tab reaches the
  stack, and the three routes are registered with native headers.
- Twenty-three mobile suites with 144 focused tests pass; typecheck and lint are clean, and a standalone
  iOS Hermes export succeeds. No remote D1, deployment, or production service was changed.
- Subscriptions complete the recurring-money part of Milestone 6. D1 migration
  `0041_mobile_sync_subscriptions.sql` adds a `revision` column to `subscriptions`, widens the
  change-log entity-type check to include `'subscription'`, creates a `mobile_sync_subscription_rows`
  view, bootstraps existing subscriptions, and adds insert/update/delete triggers. A subscription and
  its linked charge transaction share a constant `'subscription:<id>'` atomic group id, so web batches
  and mobile pushes both emit consecutive, group-locked change rows; pull accepts mixed
  {subscription, transaction} pairs and the snapshot endpoint nulls a group id when its partner row is
  absent (e.g. a canceled subscription whose charge was deleted).
- The Worker push slice creates/updates/cancels/reactivates/removes subscriptions and derives the linked
  charge (negative expense, date = next billing date, description = name). Validation mirrors the web
  repository: active expense category (`invalid_subscription_category`), Pro entitlement
  (`category_requires_pro`), and active owned account (`invalid_account`). Status transitions delete
  or re-insert the charge; deleting a subscription tombstones both rows. The idempotency row now lands
  directly after the mutation so charge statements cannot mask the mutation result.
- Local schema version 9 adds `subscriptions` and rebuilds the outbox, conflict, and tombstone
  entity-type checks to include `'subscription'`. Pull applies subscription upserts and deletion
  tombstones; the push layer sends subscription create/update/delete through the encrypted outbox with
  full-input payloads (including the optional status transition).
- Offline subscription mutations mirror Worker semantics: create validates a local active expense
  category and active account and returns a client UUID; updates send merged values and may cancel or
  reactivate; delete soft-deletes a synced row (or cancels an unpushed create). Conflicts are preserved
  and resolved without device-clock arbitration, exactly like goals and debts.
- The Subscriptions screen shows active/canceled subscriptions with cycle, next billing date, status, and
  honest pending/failed/conflict labels, plus a monthly-cost summary that reuses the shared
  `monthlySubscriptionCost` model. An editor provides name, amount, cycle, next billing date, category,
  account, and status fields; a conflict screen shows device and server versions with explicit
  resolution. A `Subscriptions` entry on the More tab reaches the stack, and the three routes are
  registered with native headers.
- Validation totals for this slice: 444 API tests (including 46 mobile-sync tests), 98 shared tests,
  and 24 mobile suites with 156 tests all pass; typecheck and lint are clean across api, shared, and
  mobile, and a standalone iOS Hermes export succeeds. No remote D1, deployment, or production service
  was changed.
- Calendar events complete the recurring-money part of Milestone 6. D1 migration
  `0042_mobile_sync_calendar_events.sql` adds a `revision` column to `calendar_events`,
  widens the change-log entity-type check to include `'event'`, creates a
  `mobile_sync_event_rows` view, bootstraps existing events with deterministic per-tenant
  revisions, and adds insert/update/delete triggers whose delete emits a tombstone guarded by
  tenant existence. All 21 existing entity triggers (including the debts and subscriptions
  triggers) are dropped and recreated verbatim around the rebuilt change log.
- The Worker push slice creates/updates/deletes calendar events. Updates merge against the
  preserved server snapshot and re-validate the merged times with the shared input schema, so
  an end time without a start time or an inverted window is a durable `invalid_operation`
  rejection; a stale update is `stale_revision`; a missing event is `entity_missing`.
  Snapshot and pull delivery validate event rows through the same schema chain.
- Local schema version 10 adds `calendar_events` and rebuilds the outbox, conflict, and
  tombstone entity-type checks to include `'event'`. Pull applies event upserts and deletion
  tombstones; the push layer sends event create/update/delete through the encrypted outbox
  with full-input payloads, and local time validation mirrors the server's merged rules.
- Offline event mutations create a client UUID, update through merged values, and delete
  soft-deletes a synced row (or cancels an unpushed create). Conflicts are preserved and
  resolved without device-clock arbitration, exactly like goals, debts, and subscriptions.
- The Calendar screen combines user events, subscription billing days, and transactions into
  one month agenda with honest pending/failed/conflict labels; an event editor provides
  title, date, optional times, and notes; a conflict screen shows device and server versions
  with explicit resolution. A `Calendar` entry on the More tab reaches the stack, and the
  three routes are registered with native headers.
- Validation totals for this slice: 447 API tests (including 48 mobile-sync tests), 98 shared
  tests, and 25 mobile suites with 169 tests all pass; typecheck and lint are clean across
  api, shared, and mobile, and a standalone iOS Hermes export succeeds. No remote D1,
  deployment, or production service was changed.
- Savings-interest modeling closes Milestone 6. The pure interest functions (Manila credit day,
  month-length clamping, floored amount, next-credit projection) moved into `packages/shared`
  so the Worker cron and the mobile modeler can never disagree; the API keeps its import path
  as a re-export and all 563 API/shared tests stay green.
- Mobile account create and update payloads may carry `interest` (the shared
  `mobileSyncAccountCreateSchema`/`mobileSyncAccountUpdateSchema`), and the push repository
  applies it atomically with the name/type mutation in one statement so the change log emits a
  single revision. The server enforces the web rules: savings type only and effective Pro for
  enabling, as durable `invalid_operation` and `plan_limit` rejections; a name-less update
  now merges the preserved name instead of failing.
- On device, savings accounts expose an Automatic interest card in the account editor: enabled
  state, annual rate, frequency, and pay day queue through the encrypted outbox and coalesce
  with pending creates and edits, so configure-then-sync works offline. The card projects the
  next credit date and amount from the locally derived balance using the shared formulas and
  states that only the server writes interest transactions. Conflicts resolved locally keep
  pending interest settings.
- Validation for this slice: 49 mobile-sync API tests (interest push gates, atomic columns,
  snapshot delivery, create-with-interest, cross-tenant plan enforcement), 115 shared tests,
  173 mobile tests across 25 suites, clean typecheck and lint everywhere, and a standalone iOS
  Hermes export succeeds. No remote D1, deployment, or production service was changed.
- Milestone 6 is complete. Remaining gaps are unchanged: M5 authenticated on-device dashboard
  run, M2 social sign-in runtime proof, M3/M4 runtime proofs, Android runtime (no emulator on
  this host), and M8-M9.

## Milestone 7 progress

- The web's security-capped workbook conversion (5 MB file cap, zip-metadata validation,
  100k-cell and 10k-row caps, formula last-value semantics, canonical CSV serialization) moved
  into `packages/shared` as the single implementation both platforms use; the web keeps its
  local import paths through thin re-exports and stays byte-for-byte identical. Bank presets
  (BPI, BDO, MariBank, BoA, JPMorgan) and preset detection also moved to shared.
- The mobile flow preserves the web contract end to end: a native document picker for
  CSV/XLSX/XLS with byte caps checked before reading, shared header inspection with suggested
  and alternative header rows, bank-preset or manual column mapping (date, description, amount
  or debit+credit, type, category), and a fallback date when the file has none. Server-side
  preview then shows ready, duplicate, and invalid rows with each row's errors; a bottom sheet
  applies per-row category and type overrides; explicit confirmation posts the commit with the
  overrides, and the next synchronization converges the imported transactions on device.
  Nothing touches the workspace before confirmation.
- The transport validates every response with new shared response schemas and maps 401/402/429/
  preview-expiry/monthly-limit rejections to honest errors; a fresh access token is retried once
  on session expiry. Server row and byte caps are mirrored (500 rows, 1 MB CSV) so no hidden
  rows can be imported unseen.
- Validation for this slice: 16 new shared tests (workbook conversion and preset resolution),
  16 new mobile tests (form rules and transport mapping), full shared+API suite at 579 tests
  across 62 files, mobile at 189 tests across 27 suites, clean typecheck and lint everywhere,
  web typecheck and all 493 web tests green, and a fresh iOS dev build with
  expo-document-picker 57.0.1 and expo-file-system 57.0.4 compiled, installed, and running on
  the iPhone 17 Pro simulator with no crashes.
- Remaining M7 caveat: the picker-to-commit path on a device with a real signed-in workspace
  still depends on the M5 authenticated-run gap (no test account on this host). Offline imports
  are intentionally unsupported: imports are online-only by design so duplicate prevention and
  atomic commit stay server-authoritative.

## Milestone 8 progress

- Online-only surfaces land behind the existing Worker routes; nothing financial runs from
  stale local cache. New shared response schemas validate every assistant, billing, support
  and deletion payload before the client displays it.
- AI Financial Assistant: the native screen mirrors the web consent gate (consent version,
  retention copy), then identity setup (assistant name, preferred name), a conversation list
  and chat composer with the same 2,000-character and clientRequestId contracts, pending/
  failed states, per-thread delete, clear-all with confirmation, and a settings sheet with
  response detail, coaching style, memory (debt strategy, remembered facts, clear memory)
  and retention copy. Plan-limit rejections surface an upgrade banner linking to Plan and
  billing instead of pretending the question failed.
- Assistant voice: expo-audio records m4a clips (60-second cap), which are transcribed by the
  Worker via Cloudflare Whisper; spoken replies from Fish Audio stream back as MP3 and play
  through expo-audio. Voice consent stays server-owned; reply mode, voice, and auto-send are
  device-local UI options stored in a versioned, Zod-validated SecureStore-backed Zustand
  store that resets when the identity changes. reviewRequired environments force the
  review-before-send mode, matching the web.
- Billing: a native Plan and billing screen renders the server summary (plan, status,
  entitlement, usages, allowances) with the web's copy semantics; checkout posts the interval
  to the Worker, opens PayPal in the system browser, then polls reconciliation so Pro access
  is only shown after server confirmation. Cancel renewal uses the web's dialog copy and the
  Worker's non-cancelable conflict surfaces honestly.
- Support and account: support chat (pageContext "app") carries the provider disclosure,
  review-first bug-report drafts submit with native diagnostics (route, release version,
  viewport, platform) and list under My reports; account deletion requires typing DELETE and
  the current password, warns permanence, and clears the encrypted local workspace only after
  the Worker confirms deletion (deleted or cleanup_pending).
- Validation: 40 new mobile tests (transport schemas and error mapping, assistant form and
  consent gating, voice-option hygiene, billing copy, support history trimming and bug-draft
  validation, deletion payload), mobile suite now 229 tests across 34 suites, shared+API
  suite still 579 across 62 files, web typecheck and 493 tests green, iOS Hermes export
  succeeds, and a fresh iOS dev build with expo-audio 57.0.3, expo-web-browser 57.0.2 and
  expo-constants 57.0.11 compiled, installed, and running on the iPhone 17 Pro simulator.
- Remaining M8 caveat: end-to-end assistant/support/billing calls need a real signed-in
  workspace (same M5 authenticated-run gap — no test account on this host), and
  transcription/speech need the Worker's voice providers configured; both are verified up to
  the transport layer by schema-tested mocks and the native build. Voice recording on the
  simulator depends on host microphone routing.

## Milestone 9 progress

- **Background synchronization task**: `expo-background-task` was previously an unused
  dependency. A guarded task now registers at launch (idempotent, platform-minimum 15-minute
  interval) and runs the mounted sync engine's retry only when a runner exists and NetInfo
  hints reachability; the Worker's actual response still decides success. When the app was
  terminated there is no React tree, so the task deliberately declines (no-op success) rather
  than half-synchronizing without the encrypted workspace and session. Nine focused tests cover
  the guard truth table, runner execution, failure reporting, and registration idempotence.
  Platform scheduling itself cannot run on the simulator and stays a device-time verification.
- **Corrupted local data fails safe**: a classifier turns SQLITE_CORRUPT/NOTADB/malformed-file
  open failures into recovery copy ("damaged … safely replaced next sign-in") and never
  surfaces raw native error text (which could contain paths or key material). The workspace
  gate displays it with a retry action; three tests cover the classification.
- **Tenant switching**: the identity-transition boundary now also resets the device-local
  assistant voice options (versioned, Zod-validated, SecureStore-backed store), closing sheets
  and clearing the plan cache as before; five tests assert no cross-account UI preference
  leakage.
- **Accessibility**: six new interaction tests for the assistant surfaces (consent heading and
  accept action, disabled identity save, separately-labeled thread rows and delete controls,
  spoken-reply labels, honest failed-answer copy, actionable plan-limit banner) join the
  existing Button/TransactionRow/MoneyValue accessibility tests.
- **Permission review**: found and fixed a real release blocker — the pre-audio-era generated
  projects lacked `NSMicrophoneUsageDescription` (iOS would crash on mic access) and
  `RECORD_AUDIO` (Android). The config now declares the mic usage string and the expo-audio
  plugin; re-prebuild verified both manifests. Remaining Android permissions are INTERNET,
  scoped storage reads (maxSdk 32), audio playback/record, VIBRATE, and the dev-client debug
  overlay (development builds only).
- **Package audit**: `expo-symbols` and `expo-system-ui` were genuinely unused and removed;
  removing them exposed a pnpm hoisting trap where the Babel JSX transform plugin stopped
  resolving for Gradle bundle builds — the plugin pair is now pinned in mobile devDependencies
  and the Android release bundle task succeeds. depcheck's remaining flags are documented
  false positives (dev-client, splash plugin, css-interop, worklets, xlsx, CLI tooling).
- **Log and secret audit**: zero `console.*` calls in mobile source; a history scan found no
  tokens, service-role keys or live credentials (only test-fixture placeholders). Flagged for
  production review: the web repo tracks `apps/web/.env.production` with the (public)
  `VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN`.
- **Release builds**: iOS Release configuration compiled (96 MB Release .app vs 135 MB debug),
  installed and ran on the iPhone 17 Pro simulator with zero error/fault log lines. Android
  `assembleRelease` succeeded (bundle + native compile); the APK was discarded immediately
  and nothing was distributed, per the signed-artifact authorization rule.
- **Performance baselines** (simulator, dev build unless noted): Hermes bytecode bundle
  7.0 MB; cold launch to process up ~1.5 s; first window activity ~1.2 s later; dev-build
  process-set RSS ~0.7 GB. These are baselines — release-build device numbers (cold start to
  first financial screen, list scroll, query latency, sync batch, APK/AAB and archive sizes)
  remain for hardware testing and are budgeted in `release-plan.md`.
- **Documents**: new `build-instructions.md`, `known-limitations.md`, and
  `release-plan.md` (TWA upgrade path, iOS distribution requirements, signing authorization
  rules, rollback plan, performance budget table).

Milestone 9 closes every host-verifiable hardening item. What remains is explicitly
externally gated: an Android device/emulator for Android runtime and low-end performance
testing, an approved test account for authenticated device runs (M2 social auth, M5
authenticated flow, M7 imports end-to-end, M8 online surfaces), destructive M3/M4 runtime
proofs on hardware, background-task device-time scheduling, and Apple/Google configuration
approvals (Sign in with Apple, bundle registration, signing). None of these can be produced
honestly from this host, and none have been faked: each is tracked in
`known-limitations.md` with its exact evidence boundary.

## Production deployment and web/mobile convergence (approved)

With explicit approval, the mobile-sync backend was deployed to production:

- **D1 migrations 0034–0042 applied** to `budget-expense-production` (revision/delete
  columns, sync state/change/idempotency tables, and append-only AFTER triggers on the
  existing account/category/transaction tables — additive; the web write path is unchanged).
- **Worker deployed** (`budget-expense-api-production` on `api.zoption.site`). Verified:
  `POST /api/app/sync/pull` returns 200 with protocolVersion/changes/nextCursor; `/me`,
  `/billing` and the website remain healthy.
- **End-to-end convergence proven on-device with the production account**: a web-API-created
  test transaction (Bank, Food & dining, -₱25.00) pulled to the iPhone simulator and rendered
  in the dashboard (Balance -₱25.00, account balances) and the Transactions tab; deleting it
  via the web API produced a tombstone that the next sync removed from the device
  ("No transactions yet", status "Up to date"). No residue remains in the account.
- The dashboard now renders real money in/out and account balances from the encrypted local
  database after a server-acknowledged sync — closing the M5 authenticated-run gap for the
  read path on iOS.

Remaining: offline-mutation push and conflict recovery still need their on-device runtime
proof (unit/API-tested), Google OAuth and Sign in with Apple runtime, Android runtime, and
the assistant-send hardware-keyboard investigation.

## Offline edit and multi-client conflict resolution (production proof)

- **Offline edit**: with the API blocked, a synced transaction was edited
  on-device ("Mobile edited while offline") and saved — the row rendered the
  edit immediately and queued the update in the encrypted outbox with its
  original base revision.
- **Concurrent web edit**: the same record was edited on the server while the
  device was offline (revision bumped).
- **Conflict detection**: on reconnect the device push was rejected on the
  revision mismatch; the web version pulled; and the row surfaced
  "Conflict needs review" with sync blocked ("Some saved changes need review
  before synchronization can finish"). No silent overwrite.
- **Explicit resolution UI**: the review screen presented both versions side
  by side ("On this device" vs "On the server", "Zoption preserved both
  versions. No device timestamp decides this choice."), required a deliberate
  choice, confirmed the discard consequence, and converged to "Up to date"
  after "Use server version" was chosen.
- Test data was deleted afterwards; both clients are back to zero records and
  `/etc/hosts` is restored.

With this, the M4 vertical slice (offline create/edit/delete, outbox
durability, restart recovery, push/pull convergence, tombstones, and explicit
conflict resolution) has complete production runtime proof on iOS. The
remaining verification items are now only: Google OAuth and Sign in with
Apple runtime, Android runtime (no device), and release-build device
performance numbers.
