# Native mobile milestone status

Last updated: 2026-08-13.

| Milestone                            | Status      | Exit evidence                                                                                                                |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0. Discovery and design              | Complete    | Verified repository/worktree baseline, parity matrix, architecture, sync protocol, threat model, shared compatibility review |
| 1. Mobile foundation                 | Complete    | Native Android/iOS development builds, iOS runtime navigation/input, themes/components, focused tests                        |
| 2. Authentication and shell          | In progress | Real Supabase session and Worker-derived tenant verified on iOS; social auth and Android runtime remain                      |
| 3. Encrypted local database          | In progress | iOS SQLCipher file/reopen proof, migrations, observable repository, and guarded sign-out implemented                         |
| 4. Transaction sync vertical slice   | In progress | Native transaction create/edit plus durable encrypted outbox push/retry/ack/conflict behavior proven on iOS                  |
| 5. Core budgeting                    | Not started | Local-first dashboard/budgets/cash flow/search with semantic parity                                                          |
| 6. Planning and recurring money      | Not started | Subscriptions/calendar/goals/debts/transfers/interest with plan boundaries                                                   |
| 7. Imports                           | Not started | Native selection, explicit preview, duplicate prevention, atomic commit                                                      |
| 8. Online-only capabilities          | Not started | Assistant/voice/billing/support/account management with online/consent boundaries                                            |
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
  labels, and explicit deletion confirmation. Transfers remain deliberately unavailable until their
  atomic protocol is implemented.
- Conflict review shows the preserved device and server financial versions. Choosing the server
  applies that validated snapshot locally; choosing the device creates a fresh idempotency key and
  revision-aware operation based on the preserved server revision. Both resolutions close the prior
  conflict and outbox reference in the same SQLCipher transaction.
- The Worker now accepts dependency-free account and category create/update/archive commands with
  client UUIDs, exact revisions, idempotent acknowledgements, tenant-scoped snapshots, permanent-row
  protection, and case-insensitive name checks. Category creation and restore keep the current atomic
  Free/Pro allowance logic; archive commands intentionally produce upserts to match the existing web
  product. Dependency-bearing batches still fail closed until graph-level atomicity is implemented.
- Native Money setup now lists observable encrypted accounts/categories and provides touch-safe
  create, edit, and confirmed archive sheets. Every mutation commits its local projection and outbox
  row together. Unsynchronized new references remain unavailable to transaction entry until their
  server revision is acknowledged, preventing unsupported parent/child graphs.
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
- Sixteen mobile suites with 68 focused tests pass. Repository-wide ESLint/typecheck and all 148
  Vitest files with 1,044 tests pass; Worker dry-run packaging and separate production-mode iOS and
  Android Hermes exports also succeed.

## Milestone 4 remaining gaps

- Dependency graphs and atomic transfer push are not implemented yet. Conflict resolution is
  implemented for non-transfer transactions; account/category and transfer conflicts remain future
  protocol work.
- Transfer changes currently enter the internal change stream as their two atomic D1 legs. The mobile
  apply layer must preserve the group as one logical transfer before financial screens consume it.
- Tombstones are retained indefinitely in this first foundation. Cursor expiry, client acknowledgement,
  compaction, and beside-the-current-database full-resync switching remain required before release.
- Migration performance has only been exercised on fresh/local SQLite data; production-scale migration
  timing and rollback rehearsal are pending and no D1 migration has been deployed.
- `apps/mobile` intentionally targets Android and iOS. A combined Expo export that also requests web
  fails because the pnpm-installed Expo SQLite package does not contain its optional web WASM asset;
  the required standalone iOS and Android exports pass, and responsive web remains owned by `apps/web`.
