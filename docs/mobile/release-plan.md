# Mobile release and rollback plan

Updated 2026-08-15. Status: planning document. No registration, signing,
store submission or production replacement has occurred or is authorized by
this document.

## Upgrade path from the existing Android TWA

1. **Parallel phase (current).** The signed TWA in `apps/android` remains
   the production Android application. The Expo app compiles and is tested
   only as development/preview builds with non-production identifiers.
2. **Verification phase.** With an approved test account: run the Expo app on
   Android and iOS devices, verify the same Supabase identity opens the same
   D1 workspace as the website, exercise offline mutations and reconciliation,
   and complete the pending runtime proofs in `known-limitations.md`.
3. **Approval gate.** Only after explicit approval does the Expo Android app
   become the replacement: create the release keystore, build a signed AAB
   for `site.zoption.android`, and update the Play Store listing. The TWA
   source stays in the repository until the replacement has shipped and been
   rolled back-verified.
4. **Rollback.** Rolling back the Play Store release reinstates the TWA; the
   server-side data model is unchanged by the mobile client, so no D1 or
   Supabase migration is needed in either direction. A downgraded client
   keeps reading the same workspace because identity and data live server-side.

## iOS distribution requirements

- Apple Developer Program membership and an App Store Connect record for the
  proposed bundle identifier `site.zoption.ios` (proposal — not registered).
- Automatic signing (distribution certificate + provisioning profile).
- `ITSAppUsesNonExemptEncryption` is already set to true in
  `app.config.ts` (the app uses HTTPS only).
- Privacy strings are in place: microphone usage description (voice input).
  No other permission-requiring features are used, so the privacy manifest
  stays minimal.
- Sign in with Apple capability + associated domains (universal/app links for
  the `zoption://` scheme and password-recovery callbacks) must be
  configured against the production Supabase project before an App Store
  build. Email/password auth works today without them.
- App Store privacy labels: no third-party tracking; authentication, purchase
  history (none stored on device beyond plan hints), and financial records are
  used for app functionality only.

## Release mechanics

- Ship channels: Play internal testing → closed → production; TestFlight →
  external testers → App Store.
- Versions: `version: 0.1.0` with `runtimeVersion: { policy: "appVersion" }`;
  each production release must build a matching embedded bundle so no
  over-the-air update bypasses review.
- Both platforms talk only to the existing Worker. Deploy the Worker before
  or independently of the app; mobile has no pinned server schema beyond the
  shared response contracts in this repository.

## Rollback plan

- **App-level**: re-publish the previous Play/App Store build or reinstate the
  TWA listing. No client data migration exists, so nothing needs reverting
  on device.
- **Server-level**: the Worker changes introduced for mobile sync (revisions,
  tombstones, cursor) are additive; rolling them back requires the documented
  migration plan in `sync-protocol.md` and would precede any app rollback.
- **Data safety**: a rolled-back client never sees a different financial
  workspace — identity and data remain server-owned.

## Performance budgets

Measured on the iPhone 17 Pro simulator with the **development** build
(debug instrumentation, Metro attached). These are baselines, not claims
about release-build device performance:

| Metric                                  | Budget target          | Measured (dev, simulator) | Status |
| --------------------------------------- | ---------------------- | ------------------------- | ------ |
| Hermes bytecode bundle                  | ≤ 10 MB                | 7.0 MB                    | ok     |
| App bundle (debug .app)                 | ≤ 200 MB               | 135 MB                    | ok     |
| Cold launch to process up               | ≤ 2 s                  | ~1.5 s                    | ok     |
| First window activity                   | ≤ 2 s after process    | ~1.2 s                    | ok     |
| Dev-build process-set RSS               | document only          | ~0.7 GB across processes  | n/a    |

Remaining to measure on release builds and real devices: cold startup, time to
first locally rendered financial screen, transaction-list scroll, local query
latency, sync batch duration, memory, APK/AAB size, and iOS archive size.
Low-end Android performance testing is pending device access and must include
a list scroll of 1,000+ transactions and an import preview of 500 rows.
