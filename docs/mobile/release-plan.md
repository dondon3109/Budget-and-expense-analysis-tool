# Mobile release and rollback plan

Updated 2026-08-17. Status: current native Beta release plan. The website-linked
Android Beta is the supported native mobile release; no app-store submission is
part of this distribution channel.

## Production Beta state

1. The native app in `apps/mobile` is the only Android application maintained in
   this repository. Its production variant uses `site.zoption.android` and the
   `Zoption Beta` name.
2. The Beta APK is linked from `https://zoption.site/install`, uses the shared
   Supabase identity and Worker/D1 workspace, and keeps financial screens
   available from encrypted local data between synchronizations.
3. Development and preview builds use separate identifiers and configuration.
   iOS remains a native build target but is not part of the public APK channel.

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

- Ship channel: website-linked Android APK. iOS distribution remains pending
  the separate Apple approval and signing work below.
- Versions: `version: 0.1.0` with `runtimeVersion: { policy: "appVersion" }`;
  each production release must build a matching embedded bundle so no
  over-the-air update bypasses review.
- Both platforms talk only to the existing Worker. Deploy the Worker before
  or independently of the app; mobile has no pinned server schema beyond the
  shared response contracts in this repository.

## Rollback plan

- **App-level**: replace the website-linked Beta artifact with a previously
  verified native Beta artifact or temporarily direct users to the website.
  Server-owned identity and data remain unchanged.
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

## 0.2.0-beta signing migration release

Released 2026-08-18. The permanent Zoption signing certificate replaces the
insecure Android debug certificate used by 0.1.0 and 0.1.1.

- **Permanent Zoption signing certificate introduced.** The SHA-256
  fingerprint is
  `F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D`
  (recorded in `android/latest.json`).
- **Existing 0.1.0 / 0.1.1 users must uninstall the old Beta before
  installing this version** — the signing identity change intentionally
  breaks in-place updates once.
- **The reinstall requirement is one-time only.** Future releases signed with
  the permanent Zoption key update over 0.2.0-beta normally.
