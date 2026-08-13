# Zoption native mobile

Expo SDK 57 development application for Android and iOS. This app is additive: it does not replace `apps/android` or change a production deployment.

## Requirements

- Node.js 22.13 or newer and pnpm 11.9.0.
- Xcode 26+ and an installed iOS Simulator runtime for iOS.
- JDK 17+, Android SDK, and an emulator/device for Android.
- A development build. SQLCipher is not a production-capable Expo Go path.

## Install and validate

From the monorepo root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @zoption/mobile typecheck
pnpm --filter @zoption/mobile test
pnpm --filter @zoption/mobile lint
```

## Development builds

```bash
APP_VARIANT=development pnpm --filter @zoption/mobile prebuild --clean
APP_VARIANT=development pnpm --filter @zoption/mobile ios
APP_VARIANT=development pnpm --filter @zoption/mobile android
```

Generated `ios/` and `android/` folders are ignored. Configuration is owned by `app.config.ts` and Expo config plugins.

On the current macOS workstation, Homebrew's JDK and the Android SDK are not exported globally. A direct Android build uses:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/dondon/Library/Android/sdk \
ANDROID_SDK_ROOT=/Users/dondon/Library/Android/sdk \
NODE_ENV=development \
PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH \
./android/gradlew -p android assembleDebug
```

The generated universal debug APK is intentionally large and is not a release-size measurement. Android runtime checks still require a connected device or installed emulator/system image.

Copy `.env.example` to an ignored `.env.local` for authenticated development, replace its
placeholders with the same Supabase project URL and publishable key used by the website, and restart
Metro. The mobile app must never contain a secret/service-role key.

Email/password sign-in and password recovery use the native Supabase session flow. Sessions are
persisted in encrypted, device-only SecureStore chunks rather than AsyncStorage. The callback URL
for the development variant is `zoption-dev://auth/callback`; it must be present in the Supabase
redirect allow-list before recovery links can return to the app.

After Supabase authentication, the app verifies the immutable subject against the existing Worker
before opening a subject-scoped SQLCipher database. The Worker derives the tenant; the mobile app does
not send or authorize with a tenant ID. Local schema migrations and the identity assertion run before
the authenticated financial shell receives the database.

The development app exposes only the local schema version and encryption status, never the key. To
verify encryption on a stopped Simulator build, locate the app container and confirm that ordinary
`sqlite3` rejects the `Documents/SQLite/zoption-*.db` file. Do not retrieve or print SecureStore values.
The iOS database-directory backup exclusion is still a documented Milestone 3 gap.

If Expo advertises a VPN address that the Simulator cannot reach, bind the development server to
the Mac's active Wi-Fi address before starting Metro:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME="$(ipconfig getifaddr en0)" pnpm --filter @zoption/mobile start
```

## Variants

- Development: `site.zoption.android.dev` / `site.zoption.ios.dev`
- Preview: `site.zoption.android.preview` / `site.zoption.ios.preview`
- Proposed production: `site.zoption.android` / `site.zoption.ios`

The production Android identifier is reserved for the eventual approved upgrade. No signing, store registration, submission, or production replacement is performed by these commands.
