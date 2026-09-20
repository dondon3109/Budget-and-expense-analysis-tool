# Review, main, 2026-09-20 (second pass)

**Reviewed by**: deepseek/deepseek-v4.1-flash
**Harness limitation**: this session cannot select a reviewer model, so this is **not** a cross-model review. The reviewer is the same model family as the author; treat it as a fresh read, not an independent one.
**Scope**: 11 files, main vs `origin/main` (merge base 716c503; commits 5a91759..8178f13, unpushed). Emphasis on the three newest — ab46b89 `chore(e2e)`, e0b4785 `docs`, 8178f13 `docs` — with the rest of the set read for regressions.
**Verdict**: Approve with nits

## Summary

The three newest commits add a fail-closed guard to `playwright.config.ts` that refuses an `.env.e2e` which loads but leaves credentials unusable, scope the changelog's "one fade in, one hold, one fade out" claim to the private startup gate, and correct the local-supabase paragraph that told readers a missing credential only skips. All three do what they claim. I reproduced every case the implementer reported — real file exit 0 (124 tests listed), malformed and incomplete files exit 1 with the missing key named, absent file silent, exported variables overriding the file — and added the cases that could misfire: the mobile project, the stub wrapper's exported four, a seeded-pair-only export, and CI's no-file case all stay green, so there is no false refusal. The guard does have one narrow hole and no automated coverage, both below. Everything else in the set is sound: the previous pass's four minors are closed with tests that genuinely fail against the code they were written to catch.

## Minor

### 🟡 Quoted whitespace-only credentials pass the new guard, then skip the suite anyway, `playwright.config.ts:25`

**Problem**: the guard tests truthiness of the raw value (`!process.env[key]`, also at `:36-38`), but `e2e/fixtures/authenticated.ts:25` and `:31` compute `process.env.E2E_EMAIL?.trim()`. A file containing `E2E_EMAIL="   "` (and the same for the other three) leaves `process.env.E2E_EMAIL` as the literal `"   "`, which is truthy, so the config loads and exits 0 — and the fixture then trims it to `""`, sets `authConfigured = false`, and skips the entire authenticated half with a green exit. Unquoted blanks are refused, because Node trims them to `""` on load; only the quoted form slips through. This is the exact outcome the comment at `:20-23` says cannot happen ("anything unusable fails here rather than letting the authenticated half skip to a green run").

**Why it matters**: the guard exists to keep a green run meaningful, and this is the last input class that still produces a silent skip. The window is narrow — it needs a quoted blank, not a typo — but the fix is one expression and it mirrors the consumer.

**Suggested fix**: measure the same thing the fixture does: compare `process.env.E2E_EMAIL?.trim()` and `process.env.E2E_EMPTY_EMAIL?.trim()` for the email keys, and keep plain truthiness for the passwords, which the fixture deliberately does not trim (a password may legitimately carry edge whitespace).

### 🟡 The guard that keeps a green e2e run honest is itself unguarded, `playwright.config.ts:24-46`

**Problem**: both refusal branches are new branching and error-handling logic with no automated coverage. `vitest.config.ts:28-32` collects `apps/**/tests`, `packages/**/tests`, and `scripts/**/*.test.mjs`, so the root config is not reachable from any suite, and `pnpm verify` never loads it. The only automated consumer is CI's `pnpm test:e2e` (`.github/workflows/ci.yml:66`), which has no `.env.e2e` and therefore exercises only the silent path. If a later edit drops the check or inverts a condition, nothing fails; the authenticated half simply goes back to skipping behind a green run, which is what the previous pass flagged.

**Why it matters**: this is dev tooling, not product code — no user is affected and `pnpm verify` stays green either way — so I am rating it Minor rather than Major despite the rubric's default for uncovered branching. But the cost of a silent regression here is exactly the false confidence the change was written to remove.

**Suggested fix**: either extract the decision into a small pure function that takes the loaded flag and an env record and returns the error (AGENTS.md allows extraction when it makes logic "independently testable"), unit-test it in `scripts/`, and call it from the config; or decide explicitly that the guard is verified by hand and say so where it lives. Do not build a subprocess harness just for this.

## Nits

- ⚪ `docs/local-supabase.md:306-309`, "A `.env.e2e` that exists but leaves `E2E_EMAIL` or `E2E_PASSWORD` unset is refused" reads as a statement about the file, but the refusal is decided on the effective `process.env` after the load: a file that omits both is accepted when they are exported (verified, exit 0). The preceding sentence does establish that exported values win, so the risk is small; saying "unset in the file and the environment" makes it exact.
- ⚪ `docs/local-supabase.md:290-299`, the paragraph invites the reader to "write `.env.e2e`" and shows the four keys, but omits the constraint the config comment (`playwright.config.ts:6-7`) and the gitignored local file header carry: keep it to `E2E_*` keys, because everything in it lands in the two dev servers Playwright starts. A `VITE_*` line there would reach the local web bundle. One sentence beside the sample block is the right home for it.
- ⚪ `CHANGELOG.md:12` and `apps/web/src/releases/currentRelease.ts:19`, "the route and its data are ready": only the `/app` dashboard waits for `dashboardSettled` (`PrivateAppStartupGate.tsx:62-64`); the other ten private routes are ready on commit alone. Accurate for the startup the copy describes, but "this month's summary" only applies on the entry route.
- ⚪ `tmp/loading-flicker/` still holds a duplicate of the pre-fix `FullPageLoadingStatus.tsx`, the probe scripts, and four run logs. `tmp/` is gitignored (`.gitignore:19`), so it cannot ship, but the copy will drift from the component. Same note as the previous pass.

## Strengths

- **The guard is placed where it can do its job and reads the right thing.** It runs at config module scope, so it fails `--list` and every project selection, not just a full run; it keys off `envFileLoaded` so an absent file stays silent (the CI case); and it reads the effective `process.env` after `loadEnvFile`, which I confirmed does not override an exported value. I reproduced the four claimed cases plus the misfire candidates: real file → exit 0 with 124 tests; malformed file → exit 1 naming both required keys; empty-pair-only file → exit 1 naming both; lone `E2E_EMPTY_*` (file or environment) → exit 1 naming the missing one; `--project=mobile-chromium` with the seeded pair only, the stub wrapper's four exported over a malformed file, a seeded-pair-only export with no file, and no file at all → all exit 0. CI has no `.env.e2e` and sets no `E2E_*` anywhere under `.github/`, so the release pipeline is untouched.
- **The response to the previous pass is complete and covered.** The safeguard now hands over through the splash (`PrivateAppStartupGate.tsx:88-100`) instead of unmounting it, and the new fake-timer test (`private-app-startup-gate.test.tsx:131-156`) fails if you put the direct `completeInitialDashboardExperience` call back — I verified that by mutating the file and restoring it. The reduced-motion readiness test (`full-page-loading-status.test.tsx:302-329`) fails if `!ready` moves below the reduced-motion branch, which is the unpinned behaviour the last pass called out. Both mutations were reverted and the tree proven clean.
- **The docs now say only what the code does.** e0b4785 fixes a real overclaim: "one fade in, one hold, and one fade out" is true of the gate, and the public fallback and the two auth guards do hand over without an exit. The corrected `docs/local-supabase.md` paragraph matches the code on required versus optional (`E2E_EMAIL`/`E2E_PASSWORD` required once the file exists, `E2E_EMPTY_*` optional but all-or-nothing), and the "skips and still exits 0" line matches the `test.skip(!authConfigured, ...)` gating in the specs.
- **Release shape is unchanged and correct**: `chore(e2e)` and two `docs:` commits release nothing, the two `fix(web)` commits carry the patch, and the in-app patch list was updated with its copy pinned by a test.

## Test coverage

Test signal **configured**. I ran: the two touched Vitest files plus `current-release.test.ts` (28 tests, all passing) and `release-note-provenance.test.ts` (3 passing); `pnpm typecheck` (workspace projects and `tsconfig.e2e.json`, exit 0); `prettier --check` and `eslint` on every changed TypeScript/Markdown file (clean); and `pnpm exec playwright test --list` against the real `.env.e2e` (exit 0, 124 tests in 10 files). I did not run `pnpm verify`, the full Playwright suite, or any dev server, per the brief.

Covered well: the mount-time exit is gone, `ready` gates the exit and the handover, `fill: "forwards"` is pinned, reduced motion still waits for readiness, the safeguard hands over through the splash, the gate's mocked splash mirrors the real contract, and the new release-note entry is pinned by title and copy.

Not covered: the `.env.e2e` guard's refusal branches (see the second Minor), and the frame between the fade ending and the splash unmounting — jsdom stubs WAAPI, so the frame that used to snap the surface back is only asserted through the `fill` option. `e2e/fixtures/accessibility.ts:159-195` re-checks 600 ms after the splash clears, which is the closest end-to-end guard and would catch a reappearance.

The real `.env.e2e` was backed up to `/tmp/reviewer-env-e2e.backup` before any experiment and restored after each one; it is byte-identical to the backup and to its original state (SHA-256 `e1b66450760c0d08fc8e4d5c03c98ddc806f69b6b09166977c0d6e6889507ca0`, `cmp` clean, mode `-rw-------`, original mtime, and `git status` clean). No credentials were printed.
