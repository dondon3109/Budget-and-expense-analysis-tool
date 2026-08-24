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

| Change Type | Action Required | Command |
| ----------- | --------------- | ------- |
| **JS / TS / UI / Styles / Stores** (`app/**`, `src/**`) | **Fast Refresh only** (Instant save) | `npx expo start` (Metro running) |
| **Native Packages / Dependencies** (`package.json`) | Rebuild Development App | `pnpm mobile:android` / `npx expo run:android` |
| **Config Plugins / Manifest** (`app.config.ts`, `plugins/**`) | Rebuild Development App | `pnpm mobile:android:rebuild` / `npx expo run:android --no-build-cache` |
| **Custom Native Code** (`modules/**`, `android/**`) | Rebuild Development App | `pnpm mobile:android` / `npx expo run:android` |
| **Production Release** | Trigger GitHub Actions CI | `Android Beta Build` workflow (Signs with production key) |

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

The website-linked Android Beta is built and published only through the
manually dispatched `Android Beta Build` GitHub Actions workflow. Its signing
key and R2 credentials remain in GitHub Actions secrets; the workflow prebuilds
the production variant, signs with the permanent Zoption key, verifies the APK
identity, publishes the immutable versioned object, verifies that public object,
and advances `android/latest.json` last. Both publish inputs must remain false
for a build-only validation run and may be enabled only with explicit release
approval. That workflow never commits to this repository.

After `android/latest.json` is publicly verified, refresh the build-time website
fallback from the repository root:

```bash
node scripts/refresh-android-release-snapshot.mjs --write
git diff -- apps/web/src/releases/androidRelease.json
```

Commit the reviewed snapshot as `fix(web): refresh Android install snapshot`
and let the normal CI/`Production Release` workflow deploy and smoke-test it.
This explicit second commit is intentional: refreshing after Pages deployment
or committing with `[skip ci]` would leave the deployed fallback and SEO
metadata one release behind. The script rejects a lower live `versionCode`;
an approved rollback must additionally pass `--allow-downgrade`.

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

The signed APK and production OTA workflows validate these values before they
build or publish, so a missing key or host now fails the workflow. To
intentionally ship an inert artifact, set the repository variable
`EXPO_PUBLIC_TELEMETRY_DISABLED=1`; remove it before re-enabling telemetry. A
new APK or OTA is required whenever the embedded build-time values change.
