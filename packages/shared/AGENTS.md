# packages/shared

## Overview

The domain package every app imports: runtime zod schemas, money and aggregate rules, import parsing, and the mobile sync wire contract. It is platform free by design so the Worker, the browser app, and the native client all run the same rules.

## Stack

- **Language / Runtime**: TypeScript, ESM, no Node built ins
- **Validation**: zod, strict schemas
- **Build**: declarations only through `tsconfig.build.json`; consumers bundle the source
- **Tests**: Vitest from the repo root, in `packages/shared/tests/`

## Key files

| File                    | Owns                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `src/index.ts`          | The barrel; every public module except `workbook`              |
| `src/schemas.ts`        | Request, response, and snapshot schemas for the API and sync   |
| `src/types.ts`          | `as const` enums that the schemas consume                      |
| `src/money.ts`          | Amount parsing and the only sanctioned sign flip               |
| `src/sync.ts`           | Mobile sync protocol constants, cursors, and payload contracts |
| `src/calculations.ts`   | Shared aggregate math for the dashboard                        |
| `src/sharedBudget.ts`   | Unsigned share token encoding and masking                      |
| `src/voiceLanguages.ts` | The single voice language catalog both clients render          |
| `src/voiceCaption.ts`   | Caption tokenizer shared by the web and native renderers       |
| `src/workbook.ts`       | XLS/XLSX conversion, deliberately outside the barrel           |

## Commands

```bash
pnpm --filter @zoption/shared typecheck
pnpm --filter @zoption/shared build      # declarations only
pnpm test                                # from the repo root
```

## Conventions

- Tests live only in `packages/shared/tests/`, never beside the source, and import a module by relative path (`../src/money`) rather than through the barrel.
- Every exported schema is `.strict()`; an unknown key is a rejection, not a warning.
- Add a new enum value to the `as const` array in `src/types.ts` and let `z.enum` follow. Do not widen the schema by hand.
- Keep domain functions pure and platform free: no Node built ins, no DOM, and UTC date math only.
- Decimal text enters the system only through `parseAmountToMinor`; everything else carries integer minor units. Never `parseFloat` at a boundary.
- Domain failures throw named errors (`MoneyParseError`, `CsvParseError`, `WorkbookImportError`); token validation returns result objects instead.

## Gotchas

- `MOBILE_SYNC_PROTOCOL_VERSION` is a literal in every sync message. Changing it breaks both shipped clients at once.
- Cursors are opaque. Pull cursors are `v1.<base36>` and snapshot cursors are `s1.<base36>`; only the server mints them, and a client that parses or builds one is a bug.
- A transfer is never a change log entity, only a snapshot used in conflict payloads.
- Deletes are tombstones with a null payload, and an upsert payload id must equal the entity id. The budget `entity_exists` conflict is the one deliberate exception.
- Category `iconEmoji` defaults to null so older change log rows do not force a resync. Do not make it required.
- Per entity money caps are written twice, in `sync.ts` and `schemas.ts`, and must stay in step.
- A monthly budget row with a limit of zero means that category is not budgeted. Budget rows are upsert only, so clearing a limit leaves the row behind; filter `limitMinor > 0` before counting plan totals, remaining budget, or utilization (`docs/maintainability.md`).
- Share tokens are unsigned and therefore public. Mask sensitive fields before encoding.
- `workbook.ts` must stay out of the barrel: it lazily imports the SheetJS build from a CDN tarball and applies its own zip bomb limits.
- `fingerprint.ts` needs `crypto.subtle` and `TextEncoder`; treat that as a platform requirement for any new consumer.

## Related specs

- `docs/maintainability.md`, `docs/mobile/shared-compatibility.md`, `docs/mobile/sync-protocol.md`

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
