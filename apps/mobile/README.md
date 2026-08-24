# Zoption native mobile

Expo SDK 57 native application for Android and iOS. The production Android variant is Zoption Beta, the supported native mobile client linked from the Zoption website.

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

## Daily Development Workflow (Fast Refresh)

Local mobile development operates with Fast Refresh (like local web development). You only compile/install the development client once, and then develop against Metro with instant hot reloading.

### 1. One-time Setup: Install the Development Build

```bash
# From repository root:
pnpm mobile:android

# Or from apps/mobile:
pnpm android
# (or npx expo run:android)
```

This compiles the native debug build (`site.zoption.android.dev` with standard Android debug keystore), installs it onto your running emulator or connected device, and launches the app.

### 2. Day-to-Day Development

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
   pnpm start
   # (or npx expo start)
   ```
3. **Launch the App**: Open **Zoption Dev** on your device/emulator (or press `a` in Metro terminal).
4. **Edit and Save**: Edit any React Native / TypeScript code or Tailwind styles in `app/` or `src/`. Changes appear instantly on the emulator via Fast Refresh without native compilation.

### What requires rebuilding the app (`npx expo run:android` / `pnpm mobile:android`)?

- Adding, removing, or updating native npm dependencies
- Changing native configuration in `app.config.ts` or config plugins
- Editing custom native modules (`modules/zoption-apk-updater`, `modules/zoption-local-data-security`)
- Modifying Android Gradle files or properties (`android/app/build.gradle`, `gradle.properties`)

Normal JS/TS/UI/styles changes do **not** require rebuilding.

Copy `.env.example` to an ignored `.env.local` for authenticated development, replace its
placeholders with the same Supabase project URL and publishable key used by the website, and restart
Metro. The mobile app must never contain a secret/service-role key.

Email/password sign-in and password recovery use the native Supabase session flow. Sessions are
persisted in encrypted, device-only SecureStore chunks rather than AsyncStorage. The callback URL
for the development variant is `zoption-dev://auth/callback`; it must be present in the Supabase
redirect allow-list before recovery links can return to the app.

After Supabase authentication, the app opens only the immutable-subject-scoped SQLCipher database so
previously synchronized screens remain available without the Worker. In parallel, it verifies that
subject against the existing Worker before synchronization begins. The Worker derives the tenant; the
mobile app does not send or authorize with a tenant ID. A failed reachability check leaves local reads
available, while an authenticated identity mismatch signs out and preserves the encrypted workspace.

The development app exposes only the local schema version and encryption status, never the key. To
verify encryption on a stopped Simulator build, locate the app container and confirm that ordinary
`sqlite3` rejects the `Documents/SQLite/zoption-*.db` file. Do not retrieve or print SecureStore values.
The fixed local data-security module applies and verifies iOS backup exclusion on the SQLite directory
before opening a workspace; Android startup similarly verifies that application backup remains disabled.

If Expo advertises a VPN address that the Simulator cannot reach, bind the development server to
the Mac's active Wi-Fi address before starting Metro:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME="$(ipconfig getifaddr en0)" pnpm --filter @zoption/mobile start
```

## Variants

- Development: `site.zoption.android.dev` / `site.zoption.ios.dev`
- Preview: `site.zoption.android.preview` / `site.zoption.ios.preview`
- Production (Zoption Beta): `site.zoption.android` / `site.zoption.ios`

### Building the Beta APK

`APP_VARIANT` selects the variant's app name, scheme, and deep-link callback. It must be set for
**both** steps, or the embedded Expo config silently falls back to the development variant (the
native manifest and the JS `Constants.expoConfig` would disagree, and OAuth callbacks would use
the wrong `zoption-dev://` scheme):

```bash
cd apps/mobile
APP_VARIANT=production npx expo prebuild --platform android --no-install
cd android
APP_VARIANT=production ANDROID_HOME="$HOME/Library/Android/sdk" \
  JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17)" \
  ./gradlew assembleRelease
```

The Beta APK is sideloaded from the Zoption website and is not distributed through Google Play.

## OTA updates

Expo OTA support is implemented as a separate JS/assets-only channel and does
not replace the verified APK updater. Development and unconfigured builds keep
it disabled. Production updates must be signed by the private key matching the
public certificate pinned in a future signed APK. Activation is deferred until
the required EAS subscription and an explicit signed-APK release are approved; see
[`docs/mobile/ota-updates.md`](../../docs/mobile/ota-updates.md) for the release
gate, runtime boundary, and rollback procedure.
