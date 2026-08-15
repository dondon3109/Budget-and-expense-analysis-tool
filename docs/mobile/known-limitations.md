# Mobile known limitations

Updated 2026-08-15. Runtime items are host-environment gaps, not unbuilt code:
each surface has tests and a successful native compile, but not a signed-in
device run on this machine.

## Host and runtime gaps

- **Partial close (2026-08-16):** email/password sign-in, session
  persistence across relaunch, Worker identity/tenant derivation, encrypted workspace open,
  live billing summary, assistant consent/identity/threads, and the support/account/import
  screens were all verified on-device with the production test account. The remaining
  authenticated gaps below still stand.

- **No Android device or emulator on this host.** Android release/debug builds
  compile (see milestone evidence), but no Android runtime behavior — touch,
  navigation, SQLCipher, background task, voice — has been exercised on
  Android. Low-end Android performance testing (M9) is therefore pending
  device access.
- **Sync pull requires a production Worker deployment.** The mobile-sync routes
  (`/api/app/sync/*`) and their D1 migrations exist only in this worktree; production returns
  404, so financial data cannot yet converge on-device. Deployment needs explicit approval.
  Until then, the financial screens show their honest empty/failed states.
- **No Android device**, and a few flows remain unverified even on iOS:
  screens that need a real signed-in workspace (assistant turns, support chat,
  billing checkout, account deletion, imports end-to-end) are verified up to
  the transport layer with schema-tested mocks and a booting dev build, not a
  live session. Multi-device and web/mobile convergence remain unit/API-tested
  but not hand-verified on two real devices.
- **Sign in with Apple** is not configured (no Apple capability or registered
  identifiers yet — requires external approval), so the M2 iOS social-auth
  runtime proof is outstanding. Google OAuth likewise needs a signed-in
  device run.
- **Background task scheduling.** The OS owns task timing; the iOS simulator
  cannot run the production scheduler. The task registers at launch, is
  idempotent, and declines (no-op success) when the app was terminated rather
  than half-synchronizing without a mounted engine. Device-time verification
  is pending.
- **Voice providers.** Transcription (Cloudflare Whisper) and speech (Fish
  Audio) need the Worker's provider configuration in the environment the
  device reaches. Simulator microphone capture also depends on host mic
  routing.
- **Performance numbers are simulator/dev-build measurements**, not
  release-build device measurements. See `release-plan.md` for the budget
  table and what remains to be measured on hardware.

## Deliberate decisions

- Imports are online-only by design: preview-first duplicate prevention and
  atomic commit stay server-authoritative.
- The AI assistant is online-only and read-only; there is no offline model
  behavior and no financial answers from stale local caches.
- The mobile support surface submits bug reports only after explicit user
  review; the support assistant never reads financial records.
- Background sync after process termination is a documented no-op (see above)
  rather than an unverifiable headless sync path.

## Known tooling friction

- `expo-doctor` reports seven pre-existing patch mismatches (expo
  ~57.0.13 vs 57.0.12 and friends). These are deliberate pins to the SDK 57
  matrix; they stay until a measured reason to move exists.
- `depcheck` flags `expo-dev-client`, `expo-splash-screen`,
  `react-native-css-interop`, `react-native-worklets`, `xlsx`,
  `expo-doctor` and `prettier-plugin-tailwindcss` as unused; each is
  required (dev-build entry, config plugin, NativeWind/reanimated peer, shared
  workbook runtime, CLI tooling). `expo-symbols` and `expo-system-ui` were
  genuinely unused and were removed in M9.
- The web repository tracks `apps/web/.env.production` containing
  `VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN` (a public beacon token, but flagged
  for a cleanup review on the production side). Mobile adds no secrets and
  commits no `.env` files beyond `.env.example`.
