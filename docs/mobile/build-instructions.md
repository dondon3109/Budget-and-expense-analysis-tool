# Mobile build instructions

Last updated: 2026-08-20. All commands run from `apps/mobile` in the repository.
Nothing here registers, publishes, or replaces any store artifact; those
actions require explicit approval.

## Prerequisites

- Node v22, pnpm 11, and the repository lockfile installed (`pnpm install`).
- iOS: Xcode with an iOS simulator or a device. The verified simulator is an
  iPhone 17 Pro (UDID `3F3BB21E-8088-41B1-8E48-C2BC2110B770`).
- Android: JDK 17 and the Android SDK.

  ```bash
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  ```

## Variants

`APP_VARIANT` selects the app identity (see `app.config.ts`):

| Variant     | Name            | Android package              | iOS bundle ID            | Scheme          |
| ----------- | --------------- | ---------------------------- | ------------------------ | --------------- |
| development | Zoption Dev     | site.zoption.android.dev     | site.zoption.ios.dev     | zoption-dev     |
| preview     | Zoption Preview | site.zoption.android.preview | site.zoption.ios.preview | zoption-preview |
| production  | Zoption         | site.zoption.android         | site.zoption.ios         | zoption         |

The production identifiers are used only for the website-linked Beta build;
development and preview builds use their own identifiers. The iOS bundle
identifier is a proposal pending approval and Apple Developer registration.

## Development builds (required — not Expo Go)

```bash
# iOS (builds the native project, installs, starts Metro)
npx expo run:ios --device <UDID>

# Android (requires the exported JDK/SDK paths above)
npx expo run:android
```

Development builds include `expo-dev-client`. The native projects are
generated from `app.config.ts`; after changing config plugins run
`npx expo prebuild --clean` (or `--no-install` to skip pod install).

## Android emulator (available on this host)

An Android 15 emulator is installed on this machine:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
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
approval.

Local release builds remain compile proofs and must never be distributed. iOS
production signing is still unconfigured and requires an Apple Developer
distribution certificate, provisioning profile, and App Store Connect record.
