# Optional-system flags

These flags reduce solo-maintainer load without silently deleting product capability. They are
planning labels only: **keep** means maintain normally, **freeze** means security/correctness fixes
only, and **review** means collect usage and operating-cost evidence before expanding or retiring it.

Last reviewed: 2026-08-22.

## Keep isolated

| System                 | Flag | Reason and boundary                                                                                                            |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| Read-only AI assistant | Keep | Active product capability. Provider failure must never block financial reads/writes, readiness, deletion, or export.           |
| Receipt entry          | Keep | Active review-before-commit workflow. Images remain in flight; transaction commit continues through the canonical import path. |
| Signed APK updater     | Keep | Current native release and repair channel. Package, version, hash, signer, and installer checks remain mandatory.              |

## Freeze

| System                                           | Flag            | Reconsider when                                                                                                                                                                                                       |
| ------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo OTA publishing                              | Freeze          | A paid/configured EAS project exists, an OTA-capable signed APK is live and physically verified, rollback is rehearsed, and the separate signing boundary has an operator. Current implementation remains dormant.    |
| `apps/ads` Remotion renderer and generated media | Freeze          | A concrete campaign requires refreshed product claims and assets. It stays outside runtime/release-critical ownership. Consider moving rendered outputs out of the main source tree in a separately approved cleanup. |
| PostHog AI observability                         | Freeze disabled | Preview payload allow-list, retention disclosure, and provider-side privacy behavior are reverified. Do not enable merely because the integration exists.                                                             |

## Review before further investment

| System                                      | Flag   | Evidence needed                                                                                                                                                                                       |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoken assistant replies through Fish Audio | Review | Usage, completion benefit, provider cost/failure rate, and whether text plus transcription covers the same need.                                                                                      |
| Public AI support chat                      | Review | Deflection/helpfulness, abuse and rate-limit load, provider cost, and whether static FAQ/support reporting is sufficient.                                                                             |
| Voice and PDF financial entry modes         | Review | Per-mode preview-to-commit conversion, correction rate, extraction failures, privacy support burden, and overlap with receipt/import workflows. Keep review-before-commit mandatory while evaluating. |
| Customer reviews and administration         | Review | Actual moderation frequency and acquisition value compared with its authenticated/admin surface and maintenance cost.                                                                                 |
| Mobile crash/product telemetry              | Review | Demonstrated diagnostic value, retention/privacy burden, and a documented response workflow for collected events.                                                                                     |

## Retire

Nothing is flagged for immediate retirement. Usage and operating-cost evidence is not yet strong
enough to justify destructive removal. A retirement proposal must identify data/export implications,
references in both clients, migrations, legal text, release workflows, and a rollback or recovery
path before implementation.
