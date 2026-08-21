# Mobile security and privacy threat model

## Assets

- Supabase access and refresh tokens.
- SQLCipher database key and encrypted user workspace.
- Financial records, descriptions, account/category names, imported file content, assistant content, and conflict versions.
- Tenant mapping, plan state, sync cursor, and outbox operations.

## Trust boundaries

- The device and mobile UI are untrusted for authorization.
- Supabase authenticates identity; the Worker verifies the token and derives the tenant.
- The Worker/D1 boundary owns plan and financial invariants.
- SecureStore protects small secrets through Android Keystore/Apple Keychain; SQLCipher protects the financial database at rest.
- NetInfo and background schedulers are availability hints only.

## Threats and controls

| Threat                                           | Required control                                                                                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service or deployment secrets extracted from app | Ship only public URL and Supabase publishable key; validate build config; scan bundles and logs                                                                                                                                               |
| Cross-user data after account switch             | Subject-scoped database/key names, close-before-open transition, clear observers/caches; Worker identity assertion gates sync, not local reads                                                                                                |
| Plaintext local finance                          | SQLCipher enabled in both native targets; set key before schema access; verification test reads file bytes/native SQLite without key                                                                                                          |
| Database key in backups                          | SecureStore configuration plus platform backup exclusions; database files excluded from unsafe cloud/device transfer paths                                                                                                                    |
| Token leakage                                    | SecureStore-backed session persistence, no logs/breadcrumbs/screenshots, redacted network diagnostics                                                                                                                                         |
| Client-supplied tenant or entitlement            | Strict request schemas reject tenant IDs; Worker derives both tenant and effective plan                                                                                                                                                       |
| Replay/duplicate mutation                        | Tenant-scoped idempotency record and canonical request hash                                                                                                                                                                                   |
| Device-clock overwrite                           | Server monotonic cursor, server timestamps, row revisions; no last-device-time-wins logic                                                                                                                                                     |
| Half transfer                                    | One logical command and atomic local/server transactions                                                                                                                                                                                      |
| Silent conflict loss                             | Preserve base/local/server versions and require explicit resolution                                                                                                                                                                           |
| Malicious import                                 | Bounded file size/rows, safe parser, no formula execution, preview before online atomic commit, no file-content logging                                                                                                                       |
| Compromised/crashed migration                    | Versioned transactional migrations, backup generation/recovery state, fail closed without deleting readable data                                                                                                                              |
| Arbitrary exfiltration path                      | Allowlisted Worker base URL and typed routes only; no arbitrary HTTP/SQL/debug consoles in production                                                                                                                                         |
| Sensitive telemetry                              | No financial fields, tokens, names, descriptions, file contents, or assistant messages in analytics/crash breadcrumbs; custom crash fields carry only coarse exception types, developer source labels, and message-free stack grouping tokens |
| Stale JWT after account deletion                 | Honor Worker `410` tombstone behavior; freeze and clear according to documented recovery state                                                                                                                                                |
| Rooted/jailbroken device                         | At-rest encryption and minimal exposure reduce risk but cannot guarantee secrecy on a fully compromised runtime; document limitation honestly                                                                                                 |

## Key lifecycle

1. Generate a cryptographically random database key on first workspace creation.
2. Store only the key in SecureStore under an opaque subject-derived alias scoped by the application bundle.
3. Open SQLCipher and apply the key before any other statement.
4. Never interpolate the key into logs or error messages. Use a narrowly reviewed database-open function.
5. On deliberate local discard after safe sign-out/deletion, close the database, remove the database files, then remove the corresponding SecureStore key. If cleanup is interrupted, recovery detects and completes the same identity-scoped operation.

Supabase session storage and the database-key record use separate aliases and deletion flows.

The implemented iOS key accessibility is `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so the key does not
migrate to another device. Android application backup is disabled. A fixed local native module applies
and verifies Apple's `isExcludedFromBackup` resource value on `Documents/SQLite` before the database
opens. It exposes no caller-selected path; failure prevents workspace access.

## Sign-out and deletion

- With no pending/conflicted work, sign-out closes the workspace and removes user-scoped local material after Supabase sign-out succeeds or a documented local-sign-out state is entered.
- With unsynchronized work, the user must choose to remain signed in and sync, or deliberately discard local work after a clear irreversible-warning flow. There is no silent discard.
- Account deletion is online and high friction. Local clearing follows server `deleted` confirmation or a documented `cleanup_pending` recovery flow; a stale token cannot recreate a tenant.

## Validation evidence required before release consideration

- Demonstrate that plaintext SQLite tooling cannot read the financial database without its key.
- Inspect Android Auto Backup/data-extraction rules and iOS backup protection for database and secret artifacts.
- Search release bundles, native manifests, logs, tests, screenshots, and source for secrets and sensitive fixtures.
- Exercise two real Supabase identities and prove no local or server cross-tenant visibility.
- Exercise expired tokens, identity switch, migration corruption, interrupted cleanup, and lost sync responses.

## Crash telemetry

The Android Beta ships operator-enabled, build-time gated crash reporting
(`apps/mobile/src/telemetry`, posthog-react-native). It is **not user opt-in**:
there is no in-app consent setting today, and every installation built with an
embedded `EXPO_PUBLIC_POSTHOG_KEY` reports crashes unless the operator
disables the pipeline. Properties:

- **Inert without a key.** Without `EXPO_PUBLIC_POSTHOG_KEY` at build time no
  client is constructed and no network calls are made; local and CI builds are
  unaffected.
- **Sanitized crash fields only.** The SDK's exception autocapture stays fully
  disabled because it would transmit raw errors and stacks, which can embed
  transaction text, identifiers, or server responses. Zoption's custom fields
  instead carry a coarse exception type (for example `TypeError`), a grouping
  token derived from message-free normalized stack frames, and a
  developer-controlled source label. Raw messages, complete stacks, workspace
  contents, notes, account identifiers, and credentials are never attached.
  PostHog still adds the minimal event envelope required by its protocol,
  including ephemeral pseudonymous distinct/session identifiers and SDK
  metadata. Persistence is memory-only, person profiles and default person
  properties are disabled, and no Zoption/Supabase identity is supplied. App
  lifecycle events, surveys, session replay, console capture, and the native
  crash plugin are all disabled.
- **Two kill switches.** Remote: disabling the PostHog feature flag
  `crash-telemetry-enabled` stops reporting after the next SDK flag refresh or
  app restart; the app fails closed and sends nothing while flags are unknown
  or the flag is absent or false. Build-time:
  `EXPO_PUBLIC_TELEMETRY_DISABLED=1`, passed through CI from a repository
  variable, keeps the client unconstructed in every subsequently built
  APK/OTA; devices already installed receive it only by shipping such an
  update.
- **Fail-safe initialization.** The PostHog module loads lazily inside a
  caught initializer; a telemetry failure can never prevent startup or
  compound the failure being reported.
- **JS-only dependency.** posthog-react-native has no required native module,
  so adding it does not change the expo-updates native fingerprint or require
  a new signed APK bootstrap.
- **Uncaught errors take one path.** SDK autocapture is replaced by a global
  handler wrapper that forwards exceptions through the same sanitizer; the
  root error boundary reports through it as well. Delivery on a fatal crash is
  best-effort.
- **Scope is intentionally narrow.** This pipeline covers the root React error
  boundary and uncaught JavaScript exceptions only. It does not claim Android
  ANR, native-crash, or unhandled-promise-rejection coverage; those require a
  separately reviewed native observability design and signed APK.

## Known limitations

- SQLCipher file-level encryption, process-reopen behavior, and database backup exclusion are proven
  on iOS Simulator. Android runtime proof remains.
- iOS background execution is system scheduled and unavailable in Simulator; a physical-device test is required.
- A fully compromised device can observe data while the user has unlocked and opened the app.
- The Expo application is a native Android/iOS target. Its optional web export is unsupported while
  Expo SQLite's web WASM asset is absent in the pinned pnpm package; the existing `apps/web` site remains
  the supported responsive-web surface.
