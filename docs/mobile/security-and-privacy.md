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

| Threat                                           | Required control                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Service or deployment secrets extracted from app | Ship only public URL and Supabase publishable key; validate build config; scan bundles and logs                                               |
| Cross-user data after account switch             | Subject-scoped database/key names, close-before-open transition, clear observers and in-memory caches, startup identity assertion             |
| Plaintext local finance                          | SQLCipher enabled in both native targets; set key before schema access; verification test reads file bytes/native SQLite without key          |
| Database key in backups                          | SecureStore configuration plus platform backup exclusions; database files excluded from unsafe cloud/device transfer paths                    |
| Token leakage                                    | SecureStore-backed session persistence, no logs/breadcrumbs/screenshots, redacted network diagnostics                                         |
| Client-supplied tenant or entitlement            | Strict request schemas reject tenant IDs; Worker derives both tenant and effective plan                                                       |
| Replay/duplicate mutation                        | Tenant-scoped idempotency record and canonical request hash                                                                                   |
| Device-clock overwrite                           | Server monotonic cursor, server timestamps, row revisions; no last-device-time-wins logic                                                     |
| Half transfer                                    | One logical command and atomic local/server transactions                                                                                      |
| Silent conflict loss                             | Preserve base/local/server versions and require explicit resolution                                                                           |
| Malicious import                                 | Bounded file size/rows, safe parser, no formula execution, preview before online atomic commit, no file-content logging                       |
| Compromised/crashed migration                    | Versioned transactional migrations, backup generation/recovery state, fail closed without deleting readable data                              |
| Arbitrary exfiltration path                      | Allowlisted Worker base URL and typed routes only; no arbitrary HTTP/SQL/debug consoles in production                                         |
| Sensitive telemetry                              | No financial fields, tokens, names, descriptions, file contents, or assistant messages in analytics/crash breadcrumbs                         |
| Stale JWT after account deletion                 | Honor Worker `410` tombstone behavior; freeze and clear according to documented recovery state                                                |
| Rooted/jailbroken device                         | At-rest encryption and minimal exposure reduce risk but cannot guarantee secrecy on a fully compromised runtime; document limitation honestly |

## Key lifecycle

1. Generate a cryptographically random database key on first workspace creation.
2. Store only the key in SecureStore under a subject-scoped, environment-scoped alias.
3. Open SQLCipher and apply the key before any other statement.
4. Never interpolate the key into logs or error messages. Use a narrowly reviewed database-open function.
5. On deliberate local discard after safe sign-out/deletion, close the database, remove the database files, then remove the corresponding SecureStore key. If cleanup is interrupted, recovery detects and completes the same identity-scoped operation.

Supabase session storage and the database-key record use separate aliases and deletion flows.

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

## Known limitations at discovery

- SQLCipher configuration is not proof of encrypted runtime behavior; Milestone 3 must provide file-level and reopen tests.
- iOS background execution is system scheduled and unavailable in Simulator; a physical-device test is required.
- A fully compromised device can observe data while the user has unlocked and opened the app.
