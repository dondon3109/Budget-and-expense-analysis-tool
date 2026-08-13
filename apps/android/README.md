# Zoption Android APK

Zoption's Android package is a Trusted Web Activity generated with Bubblewrap 1.25.0 and Android Browser Helper. It opens `https://zoption.site/app` in standalone mode with the Android system status bar visible, and is distributed only as a release-signed APK from `zoption.site`. This project does not create a Play Store listing or ship an Android App Bundle.

## Identity and versions

- Package ID: `site.zoption.android`
- APK release version: read from `apps/android/package.json`
- Version code: `major * 10000 + minor * 100 + patch` (minor and patch must each be 0–99)
- Minimum Android: Android 5.0 / API 21
- Target and compile SDK: API 36
- Launch URL: `https://zoption.site/app`

Run `node apps/android/scripts/verify-version.mjs` before every APK build. Keep `apps/android/package.json`, `twa-manifest.json`, and `app/build.gradle` synchronized. The hosted Zoption product version may advance independently because the TWA loads the current production web app; a web-only release does not require an identical wrapper rebuild.

## Permanent release identity

The release keystore is intentionally outside the repository. On the release Mac, its default location is:

```text
~/.zoption-android-signing/zoption-release.jks
```

The alias is `zoption-release`. The password is stored in the macOS login Keychain under service `Zoption Android Release Keystore` and account `site.zoption.android`. Never put the keystore, password, or a password-bearing command in Git, shell history, logs, CI output, or `twa-manifest.json`.

Back up the keystore and its password independently in secure, off-device locations. Losing either one prevents future APKs from updating an installed Zoption app. Replacing the key changes the certificate fingerprint and requires users to uninstall before installing the replacement identity.

## Build a release APK

Prerequisites are Java 17, Android SDK/build tools, pnpm, and the permanent release identity. Install workspace dependencies, then run:

```sh
pnpm android:release
```

The script uses the pinned Bubblewrap CLI, skips Bubblewrap's password-bearing signer, retrieves the password without printing it, signs with Android `apksigner` via environment references, verifies alignment and signature schemes, and writes only the final versioned APK plus checksum to `~/Builds/Zoption/`. It refuses to overwrite an existing version.

For the initial bootstrap only, before the production web manifest exists, set `ZOPTION_SKIP_PWA_VALIDATION=1`. Normal releases must allow Bubblewrap to validate the live PWA.

## Web release order

1. When the Android wrapper changes, update `apps/android/package.json` and its synchronized Android version fields. For web-only releases, leave the immutable APK metadata unchanged.
2. Update the web manifest and PWA assets, then deploy them if Bubblewrap needs the new live manifest.
3. Build the signed APK and record its exact byte size and SHA-256 in `apps/web/src/releases/androidRelease.json`.
4. Build the web app.
5. Stage the immutable artifact into the deploy output only:

   ```sh
   pnpm android:stage:web /absolute/path/to/zoption-android-VERSION.apk
   ```

6. Deploy `apps/web/dist`. Never copy APKs into `apps/web/public` or commit them.
7. Verify the production response headers, downloaded checksum, APK signature/package/version, Digital Asset Links response, and an install/update on Android.

The committed `assetlinks.json` fingerprint must match `apksigner verify --print-certs`. A mismatch causes Chrome to show browser UI instead of a verified Trusted Web Activity.
