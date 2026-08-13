# Native mobile milestone status

Last updated: 2026-08-13.

| Milestone                            | Status      | Exit evidence                                                                                                                |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0. Discovery and design              | Complete    | Verified repository/worktree baseline, parity matrix, architecture, sync protocol, threat model, shared compatibility review |
| 1. Mobile foundation                 | Complete    | Native Android/iOS development builds, iOS runtime navigation/input, themes/components, focused tests                        |
| 2. Authentication and shell          | In progress | Email/password session lifecycle works on iOS; social auth, Android runtime, and same-D1-workspace proof remain              |
| 3. Encrypted local database          | Not started | SQLCipher/key/migration/reopen/failure proof                                                                                 |
| 4. Transaction sync vertical slice   | Not started | Offline CRUD, restart recovery, idempotent reconnect, web/mobile conflicts, convergence                                      |
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

None. Milestones 0 and 1 exist only in the isolated worktree. They do not modify the main checkout, production Worker, D1, Supabase project, Pages site, TWA, store records, or deployed artifacts.

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
- Identity transitions clear temporary user-scoped UI state. Milestone 3 will attach encrypted
  workspace close/remove behavior to the same boundary before financial records exist locally.
- Focused tests cover validation and large/corrupt/remove cases for encrypted session persistence.

## Milestone 2 remaining gaps

- A successful real-account sign-in and authenticated Worker request have not been exercised because
  no user credential was entered during automated verification.
- Google social authentication and Sign in with Apple are not implemented yet. Provider dashboard,
  Apple capability, universal/app links, and verified account-linking proof remain.
- Android authentication runtime proof remains blocked by the host's missing emulator/device.
