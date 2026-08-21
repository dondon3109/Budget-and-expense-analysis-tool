# Native mobile OTA updates

Status: implemented but dormant. Activation is deferred until the required paid
EAS service and a separate signed-APK release are explicitly approved.

Zoption has two deliberately separate update channels:

1. **OTA updates** deliver runtime-compatible JavaScript and bundled assets through
   Expo Updates. They never install native modules, change Android permissions,
   replace the signing certificate, or increment `versionCode`.
2. **APK updates** remain the native release channel. The existing updater downloads
   from `downloads.zoption.site`, checks size and SHA-256, verifies the package,
   `versionCode`, and permanent Zoption signing certificate in native code, then
   opens Android's package installer.

The OTA feature lives in `apps/mobile/src/features/ota-updates`. It has no import
from or call into `apps/mobile/src/features/updates` or the
`zoption-apk-updater` native module. Both cards appear independently in More:
quick fixes first, verified APK updates second.

## Runtime and client behavior

- `runtimeVersion` uses the Expo `appVersion` policy. An OTA is eligible only for
  a binary with exactly the same app version.
- Development builds keep OTA disabled. Preview and production builds enable it
  only when a valid `EAS_PROJECT_ID` is embedded at prebuild time.
- Production binaries use the `production` channel; preview binaries use
  `preview`.
- Expo's automatic launch behavior is limited to error recovery. Zoption checks
  after initial interactions, downloads a compatible update in the background,
  and never reloads the app without the user's explicit **Restart and apply**
  action. A downloaded update also applies on a later cold start.
- Check/download failures do not affect the embedded bundle, encrypted local
  database, synchronization, or APK updater.

## One-time bootstrap

The public `0.2.7-beta` APK contains the dormant `expo-updates` dependency but
was built without an EAS project ID, so it cannot receive OTA updates. Do not
publish an OTA until a later OTA-capable APK is live and verified.

The next explicit signed-APK release must:

1. Create/link the EAS project and store its UUID as the repository variable
   `EXPO_PROJECT_ID`.
2. Store an Expo access token as the `EXPO_TOKEN` repository or
   `mobile-production-ota` environment secret.
3. Choose a new native app version and Android `versionCode` through the normal
   signed-app release process. Do not reuse `0.2.7-beta` / `20307`.
4. Build with `APP_VARIANT=production` and `EAS_PROJECT_ID` set. The existing
   Android Beta workflow already forwards the repository variable during
   prebuild; missing configuration leaves OTA disabled and preserves the old
   build behavior.
5. Publish and verify that APK normally. When `EXPO_PROJECT_ID` is configured,
   the Android Beta workflow writes its runtime version, native fingerprint,
   and source commit to `android/latest.json` only after the public APK matches
   the verified build byte-for-byte.
6. Install and run that APK on a real Android device before authorizing the first
   OTA publication.

The `Mobile OTA Update` workflow refuses to publish unless `main` is the source,
mobile typecheck/tests/lint pass, the exact commit has successful CI, the
production channel configuration resolves, and the live APK's runtime, native
fingerprint, and source ancestry match the candidate. A native dependency,
plugin, permission, generated native configuration, or runtime change therefore
fails closed and requires a new signed APK. This keeps OTA publication
intentionally blocked until the bootstrap APK is live.

## Trust boundary

The permanent Zoption certificate remains the trust root for APK installation.
OTA has a separate RSA trust anchor: `apps/mobile/certs/ota-production.pem`,
whose SHA-256 fingerprint is
`09:81:EF:1B:23:3B:9E:B5:B2:DE:46:C6:75:EF:FD:A0:C5:0A:DE:87:24:C0:4A:C9:D4:D4:78:C5:BA:2E:D2:E6`.
The public certificate is configured to be embedded only in a future
OTA-capable APK; the current public APK is unchanged. The corresponding private
key is stored outside Git and as a masked GitHub Actions secret. `eas update`
receives that private key only through an ephemeral mode-600 runner file. Once
activated, the client rejects any downloaded update without a valid
`rsa-v1_5-sha256` signature for the pinned `main` key.

The protected `mobile-production-ota` environment, authenticated EAS project,
runtime/fingerprint/source gates, and explicit dispatch confirmation remain
additional controls. The certificate expires in August 2036. Rotate it through
a new runtime and signed APK well before expiry. Never commit or print the
update-signing private key.

## Publishing a quick update

Use OTA only when the diff is JavaScript/TypeScript or bundled assets and remains
compatible with the native runtime already installed. Any dependency, config
plugin, permission, Android/iOS source, Expo SDK, native module, or runtime policy
change requires a new APK/build instead.

1. Validate the candidate on a build with the same runtime.
2. Merge the exact tested commit to `main` and let CI pass.
3. Dispatch **Mobile OTA Update** from `main`, enter a concise update message,
   and confirm the pinned OTA signing trust configuration.
4. On a release device, check **More → Quick updates**, download the update,
   choose **Restart and apply**, and verify the repaired workflow plus encrypted
   local-data and synchronization startup.

If an OTA is bad, publish an EAS rollback to the embedded update (or republish a
known-good update) for the same production channel/runtime. Expo's native error
recovery remains available; the APK updater is the fallback for any repair that
needs native code.
