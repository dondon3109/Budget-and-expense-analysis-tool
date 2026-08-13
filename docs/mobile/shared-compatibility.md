# React Native compatibility of `packages/shared`

## Safe to reuse directly

- Zod schemas and domain types in `schemas.ts` and `types.ts`.
- Integer-money parsing and normalization in `money.ts`.
- Pure dashboard, budget, transfer, and account calculations in `calculations.ts`.
- Debt, goal, and projection functions in `planning.ts`.
- Subscription calculations in `subscriptions.ts`.
- CSV tokenization/header inspection in `csv.ts`, subject to mobile file-size and memory tests.
- Date normalization in `importDate.ts`.

These modules do not import Node built-ins. They still require Metro/typecheck/runtime tests because the package currently exports TypeScript source directly.

## Requires adaptation or proof

| Surface           | Risk                                                                                                            | Decision                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fingerprint.ts`  | Uses global `crypto.subtle` and `TextEncoder`; availability/behavior must not be assumed across native runtimes | Introduce a small injected SHA-256 adapter or a React Native implementation with shared canonicalization test vectors |
| Package export    | `@zoption/shared` exports `./src/index.ts` rather than compiled RN-targeted output                              | Verify Metro workspace resolution; add an explicit RN-safe subpath only if bundling/tree-shaking proves necessary     |
| Barrel export     | Importing `@zoption/shared` exposes the full module graph                                                       | Prefer explicit RN-safe subpath exports if Metro pulls incompatible code or harms startup size                        |
| Locale operations | `Intl`/locale formatting may vary by runtime/locale data                                                        | Keep stored values locale-free; test `en-PH` presentation on Android and iOS                                          |
| CSV parsing       | Whole-file string parsing can create memory pressure on lower-end Android devices                               | Enforce existing limits before decode and measure representative files                                                |
| XLS/XLSX          | Current conversion lives in a browser Web Worker and uses a browser-oriented SheetJS package                    | Do not reuse directly; evaluate a native-safe, pinned parser in Milestone 7 or limit formats with an explicit report  |
| Time/date         | JavaScript `Date` is used for deterministic UTC calculations                                                    | Preserve date-only UTC semantics and add device-timezone tests                                                        |

## Contract changes needed for sync

Milestone 4 needs new strict schemas for client IDs, idempotency keys, base revisions, push/pull batches, cursors, tombstones, and conflict payloads. These belong in `packages/shared` only after the protocol is accepted and must remain compatible with web and Worker builds.

Changing shared contracts triggers shared, Worker, and web typecheck/test/build gates.
