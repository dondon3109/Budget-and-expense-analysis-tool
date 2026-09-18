# Optional-system flags

These flags reduce solo-maintainer load without silently deleting product capability. They are
planning labels only: **keep** means maintain normally, **freeze** means security/correctness fixes
only, and **review** means collect usage and operating-cost evidence before expanding or retiring it.

Last reviewed: 2026-09-13.

## Keep isolated

| System                                      | Flag | Reason and boundary                                                                                                            |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| Read-only AI assistant                      | Keep | Active product capability. Provider failure must never block financial reads/writes, readiness, deletion, or export.           |
| Spoken assistant replies through Fish Audio | Keep | Active voice feature. Spoken replies are part of the consented assistant voice path, not a trial add-on.                       |
| Public AI support chat                      | Keep | Active product-help surface on public and in-app pages. Provider failure must not affect financial routes.                     |
| PostHog AI observability                    | Keep | Active metadata-only AI operational stream after assistant consent. Do not attach prompts, answers, or financial records.      |
| Receipt entry                               | Keep | Active review-before-commit workflow. Images remain in flight; transaction commit continues through the canonical import path. |
| Signed APK updater                          | Keep | Current native release and repair channel. Package, version, hash, signer, and installer checks remain mandatory.              |

## Freeze

| System                                           | Flag             | Reconsider when                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo OTA publishing                              | Removed          | Removed completely in favor of direct signed APK releases (`downloads.zoption.site`).                                                                                                                                 |
| `apps/ads` Remotion renderer and generated media | Freeze           | A concrete campaign requires refreshed product claims and assets. It stays outside runtime/release-critical ownership. Consider moving rendered outputs out of the main source tree in a separately approved cleanup. |
| Cloud Run Chirp 3 STT bridge                     | Freeze unshipped | Workers AI Whisper remains the runtime transcription path. Do not deploy the Cloud Run bridge unless measured voice usage clearly beats Whisper on latency and cost.                                                  |

## Review before further investment

| System                              | Flag   | Evidence needed                                                                                                                                                                                       |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice and PDF financial entry modes | Review | Per-mode preview-to-commit conversion, correction rate, extraction failures, privacy support burden, and overlap with receipt/import workflows. Keep review-before-commit mandatory while evaluating. |
| Customer reviews and administration | Review | Actual moderation frequency and acquisition value compared with its authenticated/admin surface and maintenance cost.                                                                                 |
| Mobile crash/product telemetry      | Review | Demonstrated diagnostic value, retention/privacy burden, and a documented response workflow for collected events.                                                                                     |

## Retire

Nothing is flagged for immediate retirement. Usage and operating-cost evidence is not yet strong
enough to justify destructive removal. A retirement proposal must identify data/export implications,
references in both clients, migrations, legal text, release workflows, and a rollback or recovery
path before implementation.
