# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People in the Philippines who manually track personal money, import bank exports, and need a private, understandable view of spending, budgets, cash flow, goals, and debt on Android and iOS.

## Product Purpose

Zoption turns user-entered or imported financial records into useful budgeting and planning views without requesting bank credentials. The native app succeeds when it opens the same tenant-isolated workspace as the website, renders financial screens from encrypted local data, and preserves offline changes until the Worker acknowledges them.

## Positioning

Philippine-peso-first budgeting with preview-first imports, privacy-conscious server boundaries, and a consent-gated read-only AI assistant grounded in the authenticated user's own records.

## Operating Context

Users record transactions and transfers, review monthly budgets and trends, import CSV/XLS/XLSX exports, and plan recurring money, goals, and debt. Connectivity may be intermittent. The website remains available alongside the native mobile client, while encrypted local data keeps the mobile workflow useful between syncs.

## Capabilities and Constraints

- Supabase Auth owns identity and sessions; its immutable user subject maps to the existing D1 workspace.
- The Hono Worker verifies bearer tokens, derives the tenant, validates ownership and plan entitlement, and remains the only financial-data API.
- D1 remains the server source of record. The mobile app must not write financial data to Supabase Postgres.
- Encrypted SQLCipher SQLite is the mobile source of truth for financial screens and durable offline operations.
- Money uses integer minor units. PHP is the product default; existing shared contracts also represent USD where current account/ledger behavior requires it.
- Transfers are atomic logical operations and do not contribute to income or expense totals.
- Free and Pro policy stays server-authoritative.
- The AI Financial Assistant remains online-only, consent-gated, read-only, and server-grounded.
- Development, preview, and production variants use separate native identifiers. The production Android variant is the website-linked Zoption Beta APK; no app-store listing is part of this release.

## Brand Commitments

Preserve the Zoption name, restrained green-led identity, integer-first financial clarity, and Light, Dark, and Coffee themes. The mobile app should feel native on each platform rather than reproduce website layouts.

## Evidence on Hand

- Product and system truth: `README.md`, `docs/architecture.md`, and `docs/test-strategy.md`.
- Domain contracts and calculations: `packages/shared/src` and its focused tests.
- Server authorization and product rules: `apps/api/src`, `db/schema.ts`, and API tests.
- Billing truth: `apps/web/src/components/billing/billingPlans.ts` plus Worker billing enforcement.
- Incumbent visual tokens: `apps/web/src/styles/foundation.css`.
- The production Beta APK metadata is maintained in `apps/web/src/releases/androidRelease.json`. There are no approved app-store records or mobile testimonials; future work must not invent them.

## Product Principles

- Durable truth before optimistic presentation.
- One authenticated identity, one tenant, and no second financial source of truth.
- Show offline, pending, failed, and conflicted states honestly.
- Keep common money tasks fast, compact, accessible, and touch-native.
- Preserve explicit human review before imports, conflicts, or destructive actions are committed.

## Accessibility & Inclusion

Support Dynamic Type, screen readers, high contrast, reduced motion, logical focus order, accessible financial-value pronunciation, large touch targets, safe areas, and keyboard-safe forms. Android and iOS may use different navigation or interaction conventions where that improves accessibility and familiarity.
