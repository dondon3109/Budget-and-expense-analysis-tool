# Mobile release and rollback plan

Updated 2026-08-20. Status: current native Beta release plan. The website-linked
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
- Versions use `runtimeVersion: { policy: "appVersion" }`. A native release must
  change the app version whenever its runtime changes. Compatible JavaScript
  and bundled-asset fixes may then use the separately gated Expo OTA channel;
  native dependencies, permissions, config plugins, Expo SDK changes, and
  native source changes always require another signed APK/build.
- A signed-release version bump edits exactly two files:
  `apps/mobile/package.json` for the release version name and `app.config.ts`
  for the Android `versionCode`. The `Android Beta Build` workflow resolves
  that Expo configuration once and derives every other identity value it
  publishes (APK object key, public URL, and `android/latest.json` fields), so
  no release literal is repeated anywhere else.
- The verified APK updater remains the native Android release and fallback
  channel. OTA never downloads, verifies, or installs APK files.
- Both platforms talk only to the existing Worker. Deploy the Worker before
  or independently of the app; mobile has no pinned server schema beyond the
  shared response contracts in this repository.

The public `0.2.7-beta` APK includes the dormant `expo-updates` dependency, but
was built without an EAS project ID, so it cannot receive OTA updates. Activation
is deferred until the required EAS project/token and a later explicit signed APK
complete the bootstrap in [`ota-updates.md`](ota-updates.md).

## Rollback plan

- **App-level**: replace the website-linked Beta artifact with a previously
  verified native Beta artifact or temporarily direct users to the website.
  Server-owned identity and data remain unchanged. Rolling the live channel
  back also means refreshing the website snapshot deliberately after the live
  metadata is verified. The refresh script refuses a lower `versionCode`, so
  an intentional rollback must run it with `--allow-downgrade`, review the
  generated diff, and send the snapshot commit through normal Production
  Release deployment.
- **Server-level**: the Worker changes introduced for mobile sync (revisions,
  tombstones, cursor) are additive; rolling them back requires the documented
  migration plan in `sync-protocol.md` and would precede any app rollback.
- **Data safety**: a rolled-back client never sees a different financial
  workspace — identity and data remain server-owned.

## Performance budgets

Measured on the iPhone 17 Pro simulator with the **development** build
(debug instrumentation, Metro attached). These are baselines, not claims
about release-build device performance:

| Metric                    | Budget target       | Measured (dev, simulator) | Status |
| ------------------------- | ------------------- | ------------------------- | ------ |
| Hermes bytecode bundle    | ≤ 10 MB             | 7.0 MB                    | ok     |
| App bundle (debug .app)   | ≤ 200 MB            | 135 MB                    | ok     |
| Cold launch to process up | ≤ 2 s               | ~1.5 s                    | ok     |
| First window activity     | ≤ 2 s after process | ~1.2 s                    | ok     |
| Dev-build process-set RSS | document only       | ~0.7 GB across processes  | n/a    |

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

## 0.2.1-beta in-app updater release

`versionName` `0.2.1-beta`, `versionCode` `20301`. Same permanent Zoption
signer as `0.2.0-beta`, so `reinstallRequired` is `false` and Android can
update in place.

This release ships the secure in-app APK updater: startup and manual update
checks, verified APK download, native package/signer gates, and the guided
system installer handoff. OTA JavaScript updates are not part of this release;
the later OTA implementation does not alter this updater.

## 0.2.2-beta assistant fixes release

`versionName` `0.2.2-beta`, `versionCode` `20302`. Same permanent Zoption
signer as `0.2.0-beta` / `0.2.1-beta`, so `reinstallRequired` stays `false`
and Android can update in place from `0.2.1-beta`.

This release fixes two assistant regressions reported in the 0.2.1-beta
test cycle:

- **Conversation deletion is now reliable.** Deleting an existing
  conversation succeeds and removes it; deleting an already-absent one is
  treated as the desired end state instead of surfacing a misleading
  "The assistant chat was not found." error. Auth/tenant isolation is
  unchanged, and genuine server errors still surface. Covered by server
  (api) and client (mobile) regression tests.
- **Voice transcription errors are now accurate.** The microphone path
  (record → stop → upload → transcribe → reply) no longer collapses slow
  transcription timeouts into the misleading "Zoption could not be
  reached. Connect to the internet and retry." message. Connectivity
  errors still show the connectivity message; timeouts, permission,
  recording, unsupported-audio, transcription, auth, and server errors
  now surface their accurate states.

## 0.2.3-beta Android updater performance release

`versionName` `0.2.3-beta`, `versionCode` `20303`. Same permanent Zoption
signer as the earlier `0.2.x-beta` releases, so `reinstallRequired` stays
`false` and Android can update in place from `0.2.2-beta`.

This release moves the APK transfer into a dedicated native HTTP stream with
no per-chunk progress events crossing the React Native bridge. The UI samples
the on-disk file size at most four times per second, preserving responsive
progress without backpressuring the transfer near completion. Cancellation,
strict download-host validation, redirect blocking, exact size and SHA-256
checks, package/version inspection, and signing-certificate verification remain
enforced before the system installer opens.

## 0.2.4-beta Android voice upload release

`versionName` `0.2.4-beta`, `versionCode` `20304`. The permanent Zoption signer
is unchanged, so `reinstallRequired` stays `false` and Android can update in
place from `0.2.3-beta`.

This release sends assistant recordings through Expo SDK 57's supported
file-backed multipart path. Android voice uploads no longer use React Native's
legacy URI-shaped FormData part or attach the AbortSignal that can reject the
request locally before it reaches Zoption. Connectivity, timeout, cancellation,
package, version, and signing-certificate checks remain enforced.

## 0.2.5-beta AI-assisted entry release

`versionName` `0.2.5-beta`, `versionCode` `20305`. The permanent Zoption signer
is unchanged, so `reinstallRequired` stays `false` and Android can update in
place from `0.2.4-beta`.

This release adds review-first voice transaction entry and PDF statement import
previews. It keeps the existing import validation and deduplication flow, deletes
the selected recording and statement source files from the device cache after AI
processing completes or fails, and improves receipt itemization, discount
reconciliation, and multi-transaction saving. No AI-derived entry is saved until
the user reviews and commits it.

## 0.2.6-beta update metadata revalidation release

`versionName` `0.2.6-beta`, `versionCode` `20306`. The permanent Zoption signer
is unchanged, so `reinstallRequired` stays `false` and Android can update in
place from `0.2.5-beta`.

The updater now cache-busts and sends no-cache directives when checking mutable
`android/latest.json`. The Android Beta workflow publishes that metadata with a
`no-store` response policy and verifies the public object and header after upload.
Versioned APK files remain immutable and cacheable; package, version, checksum,
and signing-certificate gates remain unchanged.

It also clarifies disabled button states and improves contrast for the
voice-entry and receipt-capture actions.

## 0.2.7-beta transaction entry defaults release

`versionName` `0.2.7-beta`, `versionCode` `20307`. The permanent Zoption signer
is unchanged, so `reinstallRequired` stays `false` and Android can update in
place from `0.2.6-beta`.

New transactions now prefer an active Cash account when one is available,
with the first active account retained as the fallback. The same typed shared
rule is used by native transaction entry, receipt drafts, and the website.
Voice recording status and receipt photo actions are also clearer and use the
shared accessible button component.

## Future signed OTA bootstrap (deferred)

The code, signing certificate, compatibility gates, and manual workflows are
kept dormant for a future release. No version is reserved. When activation is
approved, the new APK must retain the permanent APK signer, package ID, native
streaming updater, and all existing size/hash/package/version/signer checks.
It must embed the production EAS endpoint/channel and pinned OTA certificate,
with `runtimeVersion` bound to `appVersion`.
