# apps/mobile

## Overview

The Expo native client for Android and iOS. It keeps an encrypted local workspace as the source of truth for reads, records every user mutation plus an outbox row in one SQLite transaction, and syncs to the Worker with an opaque cursor protocol. It never writes financial data directly to Supabase.

## Stack

- **Language / Runtime**: TypeScript, React Native 0.86 on Expo SDK 57
- **Navigation**: expo-router
- **Styling**: NativeWind (Tailwind 3) plus the theme palette in `src/ui/tokens.ts`
- **Local data**: encrypted SQLite workspace with append only migrations
- **Sync**: `@zoption/shared` wire schemas against the Worker sync routes
- **Tests**: Jest with `--runInBand`, colocated with the source

## Key files

| File                                            | Owns                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `app/`                                          | expo-router routes; each file but a layout re-exports one screen         |
| `src/features/`                                 | Screens and pure logic modules, the real home of behavior                |
| `src/auth/authenticated-layout.tsx`             | Gate for `app/(app)`: session restore, app lock, local workspace, sync   |
| `src/db/workspace.ts`                           | Subject scoped workspace open, recovery, and generation switching        |
| `src/db/migrations.ts`                          | Append only local schema migrations and `LOCAL_SCHEMA_VERSION`           |
| `src/db/transaction-mutation-repository.ts`     | UI facing mutation facade over `transaction-mutations/`                  |
| `src/db/transaction-mutations/commands/`        | One module per entity; each command owns its row plus outbox transaction |
| `src/db/transaction-mutations/conflicts/`       | Per entity conflict inspection and keep-local/keep-server resolution     |
| `src/db/repository.ts`, `src/db/view-models.ts` | Local workspace queries, and the shapes they return to hooks and screens |
| `src/db/entity-tables.ts`                       | The one synchronized entity to SQLite table map                          |
| `src/sync/sync-state.tsx`                       | Push and pull loop; "synced" means the outbox is empty                   |
| `src/config/public-config.ts`                   | Strict `EXPO_PUBLIC_*` configuration parsing                             |
| `plugins/`                                      | Config plugins that generate the Android signing and mic widget code     |
| `index.ts`                                      | App entry: registers the widget's headless task before `expo-router`     |
| `modules/`                                      | Tracked Expo native modules                                              |

## Commands

```bash
pnpm --filter @zoption/mobile typecheck
pnpm --filter @zoption/mobile test      # jest --runInBand; append a path to filter
pnpm verify:mobile                      # typecheck, lint, format, and Jest for this package
pnpm --filter @zoption/mobile lint
pnpm mobile:start                       # adb reverse, then expo start --dev-client
pnpm mobile:android                     # adb reverse, then expo run:android
```

## Conventions

- Route files in `app/` stay one liners. Behavior belongs in `src/features/**`.
- Screens and components use PascalCase `*Screen.tsx`; pure logic modules and their tests use kebab case.
- Tests are colocated as `<module>.test.ts(x)`. Jest matches `src/**` and `plugins/**/*.test.js` only, so nothing under `app/` is collected.
- Read through `useLocalWorkspace()` hooks and repositories. Reach the network only through `src/api/*` and `apiRequest`, which bounds every request at 30 seconds; an operation that legitimately runs longer passes its own `timeoutMs`.
- Subscribe to SQLite changes through `subscribeToLocalChanges` (`src/db/local-workspace/change-stream.ts`), never `addDatabaseChangeListener` directly. One native listener per open database is shared by every hook and each subscriber's refresh is coalesced, so a sync page that writes N rows costs one re-query rather than N.
- A workspace read hook is a thin wrapper over `useLocalQuery` (`src/db/local-workspace/use-local-query.ts`), which owns the read, the change subscription, and retry. Export the hook from `src/db/local-workspace-state.tsx`, the path screen tests mock, and memoize its reader, because a new reader re-runs the query.
- `useDashboardData(anchorDate)` bounds its ledger read to `cashflowWindowStart(anchorDate)`, the widest cashflow view, and reads the three newest transactions separately for recent activity. Pass the same local date to `buildDashboardView` so the chart cannot read a window the query never loaded.
- Import icons from `@expo/vector-icons/MaterialCommunityIcons`, never the `@expo/vector-icons` barrel. The barrel registers all 16 font families as bundled assets (2.6 MB), of which the app uses one.
- Keep financial rows out of Zustand. Stores hold UI state only.
- Parse money with the shared `parseAmountToMinor` and format only through `formatMoneyMinor` or `MoneyValue`. Amounts are integer minor units with SQLite CHECK constraints.
- Read `process.env.EXPO_PUBLIC_*` with a literal key. A dynamic read is dropped from the release bundle.
- Validate wire payloads with the shared strict schemas at the boundary, and surface typed errors (`ApiTransportError`, `LocalWorkspaceError`, `LocalKeyError`) rather than raw SQLite text.

## Gotchas

- `android/` is generated by prebuild and is not tracked. Edit `plugins/with-android-release-signing.js` or `plugins/with-android-mic-widget.js`, then re-run prebuild; a hand edit to the generated tree is lost.
- Release signing never falls back to the debug key. The signing plugin reads `keystore.properties` or the `ANDROID_KEYSTORE_*` variables and throws when the Expo template drifts.
- `APP_VARIANT` must be set for both prebuild and Gradle. Without it the embedded config silently falls back to the development variant.
- Local migrations are append only: add the entry and bump `LOCAL_SCHEMA_VERSION`. The runner applies each migration in its own transaction and refuses a database newer than the app.
- One serialized writer (`LocalDatabaseWriter`) owns every financial write. Do not open another connection.
- A transfer is two local transaction rows and exactly one outbox entity. The outbox allows one active row per entity.
- Saving an assistant transaction draft is the one financial write that goes straight to the server (`confirmAssistantTransactionDraft`) and then pulls the row with `sync.retry()`, because the server owns the stored draft and its once-only claim. It works only online. Do not copy that pattern for anything the user can create offline; those write the local row plus its outbox row.
- Never add SMS or notification read permissions. SMS entry is clipboard paste parsed by the shared `parseSmsNotification`.
- The daily reminder (`src/features/reminders/daily-reminder.ts`) is a local notification scheduled on the device; the app never requests a push token. `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` come from the expo-notifications library manifest, which also declares its Firebase messaging service; that service stays inert because the app ships no `google-services.json`. Prebuild applies the expo-notifications config plugin whenever the package is installed, and it always writes the iOS `aps-environment` push entitlement, so `app.config.ts` strips that entitlement with `withoutPushEntitlement`, registered before the plugin because mods of one type run in reverse order. The plugin entry also sets the monochrome Android status bar icon (`assets/zoption-notification-icon.png`). `src/config/app-config-mods.test.ts` checks both against the resolved native config. It is on by default and schedules two daily notifications, 12:00 PM and 9:00 PM (`DAILY_REMINDERS`). `applyDailyReminder` saves the on/off choice only once the OS schedule matches it, and `useDailyReminderSession` (mounted in `app/_layout.tsx`) re-applies it once the session is signed in, which is where a new install first asks for notification permission (a refusal saves Off, so it is not asked again), and clears it when the session resolves signed out, so the card never shows On with nothing scheduled and a session that ended while the app was closed leaves no reminder behind. Every identity change (`clearUserScopedRuntimeState`) cancels both reminders and resets the choice to the default On for the next session, and an apply still in flight across one cannot bring them back, so they never outlive the account that set them. Jest picks up `__mocks__/expo-notifications.js` automatically, because the real module runs native checks on import.
- The overspending alert (`src/features/reminders/overspending-notification.ts`) is an immediate local notification posted by `SafeToSpendHero` when the shared `overspendingAlert` turns on: safe to spend is zero, or the 30-day forecast goes below zero. It announces each condition once (a spent-out week keyed by its Monday, a deficit by its date) and remembers the last one in SecureStore across restarts. It never asks for permission, so it only uses the grant the daily reminder obtained, and it posts on its own Android channel, "Spending alerts", which the user can mute separately. It only runs while the Home screen has the figure, never in the background. Every identity change (`clearUserScopedRuntimeState`) dismisses it and forgets the announced condition.
- The mic widget never opens the app. `MicWidgetVoiceActivity` captures speech and starts `MicWidgetLogService`, which runs the headless JS task `ZoptionWidgetVoiceLog` (`src/features/widget/widget-voice-task.ts`, registered at module scope from `index.ts`, so keep that entry's bare imports). The task sends the transcript to `POST /api/app/entry/voice/entries`, saves every returned entry with `createTransactions` (one SQLite transaction plus outbox rows), and answers by notification; it does not sync, so rows upload when the app next opens. It runs in the app's own JS runtime, so it opens the workspace itself through `openLocalWorkspace` and reads the session from the Supabase client. Balance-update notes (`reconcile`) are not logged: a tappable `zoption-widget-review` notification opens the `widget-intent` confirm screen instead.
- The primary goal (`src/features/primary-goal/`) is read-only server state, not ledger data, so it bypasses the outbox: `useGoalProfileSync` loads it into `useGoalProfileStore` (memory only, cleared on identity change), and saving or skipping calls `/api/app/profile/goal` directly and needs a connection. Offline the profile stays null, so the soft prompt (`useGoalPrompt`, once per launch on Home) never opens and the default CTA and assistant prompts show. Labels, CTAs and starter prompts come from `@zoption/shared` (`goals.ts`, `goalConfig.ts`); `goal-personalization.ts` only maps CTA targets to mobile routes. The server records all goal events.
- `SYSTEM_ALERT_WINDOW` must not ship and predictive back stays disabled; both are enforced in `app.config.ts`.
- `package.json` version is the only version name, and `android.versionCode` in `app.config.ts` is the one hand picked number (`0.2.34-beta` → `20334`). Bump both on every release; the `Android Beta Build` workflow rejects an APK whose identity does not match.
- `metro.config.cjs` enables `inlineRequires`, so module evaluation is deferred to first use. Keep bare side-effect imports (`react-native-gesture-handler`, `@/styles/global.css`, the module-scope `TaskManager.defineTask`) as they are: they have no binding to inline and must still run eagerly.
- Cold start phases are recorded with `markStartupPhase` from `src/diagnostics/startup-timing.ts`, which is `__DEV__`-gated and never ships. Add a phase there instead of a bare `console.log`.
- Mobile tests run only through `pnpm test:mobile` (also in CI and `pnpm verify`); root `pnpm test` is Vitest and never collects them. `pnpm -r build` skips this workspace, which has no build script.

## Related specs

- `docs/mobile/` (architecture, sync-protocol, build-instructions, shared-compatibility), `docs/maintainability.md`
