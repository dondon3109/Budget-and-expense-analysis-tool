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

| Change Type                                                   | Action Required                      | Command                                                                   |
| ------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| **JS / TS / UI / Styles / Stores** (`app/**`, `src/**`)       | **Fast Refresh only** (Instant save) | `npx expo start` (Metro running)                                          |
| **Native Packages / Dependencies** (`package.json`)           | Rebuild Development App              | `pnpm mobile:android` / `npx expo run:android`                            |
| **Config Plugins / Manifest** (`app.config.ts`, `plugins/**`) | Rebuild Development App              | `pnpm mobile:android:rebuild` / `npx expo run:android --no-build-cache`   |
| **Custom Native Code** (`modules/**`, `android/**`)           | Rebuild Development App              | `pnpm mobile:android` / `npx expo run:android`                            |
| **Production Release**                                        | Dispatch `Production Release`        | Its `android` job calls `Android Play Bundle` (signs with the upload key) |

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

## Google Play bundle

Google Play is the only Android distribution: production builds are never
sideloaded, and the app has no self-updater or `REQUEST_INSTALL_PACKAGES`
permission. Play installs and updates the app, and the About screen's "Check
for updates" opens the Play listing.

The `Android Play Bundle` workflow (`.github/workflows/android-play.yml`)
prebuilds with `APP_VARIANT=production`, runs `bundleRelease` signed with the
Play upload key, checks the signer (equal to `PLAY_UPLOAD_CERT_SHA256` when
that variable is set), the package, versionCode, and versionName, and that no
install-packages permission is requested, then keeps the AAB as a 14-day
workflow artifact. It never uploads to Play. `Production Release` runs it from
its `android` job once the Worker and web are live and tagged, so a Play upload
never carries an app that needs an API production does not run yet. Dispatch it
by hand only to retry, or to build a branch for testing:

```bash
gh workflow run android-play.yml --ref main
gh run download --name "zoption-play-<version>-<versionCode>"
```

The same artifact holds a universal APK built from that AAB by bundletool and
signed with the upload key, for testing the Play build on a phone without a
Play upload (Play refuses a reused versionCode, and Internal app sharing needs a
published app). It installs only after any other Zoption is uninstalled,
because its signer is not Play's app signing key. It is a test build only; never
distribute it.

### One-time upload key setup

The upload key only signs uploads to Play and can be reset through Play support
if lost. Generate it on your
own machine, outside the repository:

```bash
keytool -genkeypair -v -keystore ~/zoption-play-upload.keystore -alias zoption-upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Zoption, O=Zoption, C=PH"
```

Keep the keystore and both passwords in your password manager. Store them as
GitHub secrets (each command prompts for the value, so nothing lands in shell
history) and record the certificate fingerprint:

```bash
base64 -i ~/zoption-play-upload.keystore | gh secret set PLAY_UPLOAD_KEYSTORE_BASE64
```

```bash
gh secret set PLAY_UPLOAD_KEYSTORE_PASSWORD
```

```bash
gh secret set PLAY_UPLOAD_KEY_ALIAS
```

```bash
gh secret set PLAY_UPLOAD_KEY_PASSWORD
```

```bash
keytool -list -v -keystore ~/zoption-play-upload.keystore -alias zoption-upload | grep 'SHA256:'
```

```bash
gh variable set PLAY_UPLOAD_CERT_SHA256 --body "<the colon-separated SHA256 value>"
```

### Play App Signing enrollment

Play App Signing is mandatory for new apps: Google holds the app signing key and
re-signs what users install. Zoption uses a Google-generated app signing key
(recorded in `docs/deployment.md` under Google Play). Anyone who still has the
old website APK installed must uninstall it before installing from Play, which
wipes the encrypted local workspace, so sync first.

### Closed testing upload

1. Dispatch the workflow and download the AAB as above.
2. In Play Console, Test and release → Testing → Closed testing, create a track
   (or open the existing one), add the testers' email list (at least 12 people
   opted in for 14 consecutive days before production access opens for a
   personal account), and create a release.
3. Upload the `.aab`, paste the release notes from `currentRelease.ts`, and
   send the release for review. Play rejects a versionCode it has already seen,
   so each upload needs a new release bump.
4. Share the opt-in link from the track with testers.

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
with the key `crash-telemetry-enabled` and enable it for all Android
installations. The app sends nothing while that flag is absent, unresolved, or
false.

The Play bundle workflow validates these values before it builds, so
a missing key or host now fails the workflow. To intentionally ship an inert artifact,
set the repository variable `EXPO_PUBLIC_TELEMETRY_DISABLED=1`; remove it before
re-enabling telemetry. A new Play build is required whenever the embedded build-time
values change.

To resolve crash frames in PostHog Error Tracking, also store a PostHog
**personal API key** with the `error tracking write` and `organization read`
scopes:

```bash
gh secret set POSTHOG_CLI_API_KEY
```

With it set, the workflow installs `@posthog/cli`, exports
`POSTHOG_UPLOAD_SOURCE_MAPS=1` so `app.config.ts` adds the
`posthog-react-native/expo` plugin, and the release Gradle build uploads the
Hermes source map to project `549527` on `https://us.posthog.com`. Without the
secret the bundle still builds and reports crashes, with minified frames. Local
release builds never upload.
