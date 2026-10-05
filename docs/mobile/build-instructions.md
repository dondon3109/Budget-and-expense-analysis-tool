# Mobile build instructions

Last updated: 2026-08-24. All commands run from `apps/mobile` in the repository.
Nothing here registers, publishes, or replaces any store artifact; those
actions require explicit approval.

## Prerequisites

- Node v22, pnpm 11, and the repository lockfile installed (`pnpm install`).
- iOS: Xcode with an iOS simulator or a device. The verified simulator is an
  iPhone 17 Pro (UDID `3F3BB21E-8088-41B1-8E48-C2BC2110B770`).
- Android: JDK 17 and the Android SDK.

  ```bash
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
  export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
  ```

## Daily Development Workflow (Fast Refresh)

Local mobile development operates like local web development with Metro and Expo Development Client:

### 1. One-time Setup: Install the Development Build

From repository root or `apps/mobile`:

```bash
# From repository root:
pnpm mobile:android

# Or from apps/mobile:
npx expo run:android
```

This compiles the native debug binary (`site.zoption.android.dev` with standard Android debug keystore), installs it onto your running emulator or connected device, and opens the app.

### 2. Daily Workflow: Start Metro & Fast Refresh

Once the development build is installed on your device/emulator, you do **not** need to rebuild the APK for normal development:

1. **Start the Android Emulator** (if not already running):
   ```bash
   "$ANDROID_HOME/emulator/emulator" -avd zoption-api35 -no-snapshot -no-audio -gpu swiftshader_indirect &
   adb wait-for-device
   ```
2. **Start Metro**:
   ```bash
   # From repository root:
   pnpm mobile:start

   # Or from apps/mobile:
   npx expo start
   ```
3. **Launch the App**: Open **Zoption Dev** on your device/emulator (or press `a` in the Metro terminal).
4. **Edit and Save**: Edit any React Native / TypeScript components, hooks, stores, or Tailwind styles in `apps/mobile/app` or `apps/mobile/src`. Changes update instantly on screen via Fast Refresh.

### Separation of Change Types

| Change Type                                                   | Action Required                      | Command                                                                 |
| ------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| **JS / TS / UI / Styles / Stores** (`app/**`, `src/**`)       | **Fast Refresh only** (Instant save) | `npx expo start` (Metro running)                                        |
| **Native Packages / Dependencies** (`package.json`)           | Rebuild Development App              | `pnpm mobile:android` / `npx expo run:android`                          |
| **Config Plugins / Manifest** (`app.config.ts`, `plugins/**`) | Rebuild Development App              | `pnpm mobile:android:rebuild` / `npx expo run:android --no-build-cache` |
| **Custom Native Code** (`modules/**`, `android/**`)           | Rebuild Development App              | `pnpm mobile:android` / `npx expo run:android`                          |
| **Production Release**                                        | Trigger GitHub Actions CI            | `Android Beta Build` workflow (Signs with production key)               |

## Android emulator (available on this host)

An Android 15 emulator is installed on this machine:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"

"$ANDROID_HOME/emulator/emulator" -avd zoption-api35 -no-snapshot -no-audio -gpu swiftshader_indirect &
adb wait-for-device
```

Notes: the AVD uses a 6G userdata partition to fit the disk; the system image
and emulator live under `/opt/homebrew/share/android-commandlinetools` and are
symlinked into the SDK. The device uses software rendering (slow but
functional). The expo dev-client's floating menu bubble can overlap the
transaction header button — drag it away if taps open the dev menu.

## Compile-mode proofs

```bash
# iOS Release configuration (simulator; no store signing)
npx expo run:ios --device <UDID> --configuration Release

# Android release variant (template debug signing; the APK is discarded
# immediately and is never distributed)
cd android && ./gradlew assembleRelease
```

## Checks before committing

```bash
npx tsc --noEmit
npx eslint app src
npx jest --runInBand
npx expo export --platform ios   # bundle sanity; delete dist afterwards
```

## Signed production artifacts

The website-linked Android Beta is built and published only by the `Android Beta Build` workflow
(`.github/workflows/android-beta.yml`). It runs after every `Production Release` on `main`, and a
`workflow_dispatch` run covers a rebuild or a build-only check.

1. **Plan** (`scripts/android-release-plan.mjs`, no secrets, no approval). It reads the version and
   `android.versionCode` the bump PR set and compares the versionCode with the published
   `android/latest.json`. Nothing newer means it stops quietly. It also requires a frozen sync
   contract for the version, the commit to still be `main`, no other `Production Release` running,
   and production to be serving the latest release tag, because the APK talks to that API. A
   blocked plan fails the run and sends a Telegram message.
2. **Release** (one job, in the `android-beta` environment, which asks the maintainer for approval).
   It prebuilds the production variant, signs with the permanent Zoption key, verifies the APK
   identity, uploads the immutable versioned object, verifies that public object, and advances
   `android/latest.json` last, then keeps a copy of that metadata at
   `android/releases/<version>.json`. The signed APK never leaves the runner: it is not a workflow
   artifact, which is why the approval comes before the build rather than between build and
   publish. The notes in `latest.json` default to the titles of the in-app patch notes
   (`scripts/android-release-notes.mjs`); a dispatch can override them.
3. **Snapshot pull request.** After publication the workflow opens
   `fix(web): refresh Android install snapshot for <version>` from the live channel and starts its CI.
   Merging it ships a patch web release on purpose, so the deployed fallback and SEO metadata are not
   one release behind. The maintainer merges it.
4. **Notification.** A Telegram message says the release is live, blocked, failed, or not approved.

A dispatch run with `publish` off builds and verifies only. It still waits for the approval,
because the signing key exists only in that environment.

To roll the channel back, run `Android Beta Rollback` with the version to re-advertise. It
re-verifies that release's public APK against its kept metadata and copies the metadata back to
`android/latest.json`. Android refuses to install an older versionCode over a newer one, so this
only stops new installs and updates from receiving the bad build; users already on it need a fix
with a higher versionCode through the normal pipeline. Refresh the snapshot afterwards with
`node scripts/refresh-android-release-snapshot.mjs --write --allow-downgrade`.

The `Production Monitor` also checks the channel every 10 minutes (`scripts/android-channel-check.mjs`):
`latest.json` must parse, name the permanent signing certificate, and point at an APK that is
reachable at its declared size.

Local release builds remain compile proofs and must never be distributed. iOS
production signing is still unconfigured and requires an Apple Developer
distribution certificate, provisioning profile, and App Store Connect record.

### One-time PostHog setup for Android crash telemetry

From the repository root, store the PostHog **project API key** (the public
`phc_...` token for the same project as the web app) and its regional ingestion
host in GitHub Actions:

```bash
gh secret set EXPO_PUBLIC_POSTHOG_KEY
gh variable set EXPO_PUBLIC_POSTHOG_HOST --body https://us.i.posthog.com
```

Paste the project API key when the first command prompts. Do not use a PostHog
personal API key. If the project is in the EU region, use
`https://eu.i.posthog.com` instead. Then create a PostHog boolean feature flag
with the key `crash-telemetry-enabled` and enable it for all Android Beta
installations. The app sends nothing while that flag is absent, unresolved, or
false.

The signed APK workflow validates these values before it builds or publishes, so
a missing key or host now fails the workflow. To intentionally ship an inert artifact,
set the repository variable `EXPO_PUBLIC_TELEMETRY_DISABLED=1`; remove it before
re-enabling telemetry. A new APK is required whenever the embedded build-time
values change.
