# Web UI/UX and accessibility remediation — review brief

This document exists so a reviewer can assess the work without re-deriving it. It states what was
changed, how each claim was verified, and which parts deserve the most scrutiny.

## Scope

The work began from a heuristic critique of `apps/web` and grew into the first accessibility audit
of the authenticated half of the application, which had never been audited. It covers:

- accessibility defects found by axe-core on every authenticated surface
- user-visible UX defects found by reviewing screenshots of all 11 routes
- the audit harness itself, which was reporting false passes
- local tooling to make an authenticated audit possible without Docker

**Explicitly out of scope and not part of this commit:** the avatars/jobs/rate-limiting/billing
work, deployment config validation, and the Cloudflare Workers test shim. Those are another
agent's in-flight changes and were deliberately left untouched in the working tree.

## How to reproduce the verification

```bash
pnpm install
npx vitest run                      # 233 files / 1820 tests
pnpm --filter @zoption/web typecheck
pnpm -s exec tsc -p tsconfig.e2e.json --noEmit
```

The end-to-end audit needs an authenticated session. Docker and the Supabase CLI are now installed,
so the audit runs against a real local Supabase stack — see `docs/local-supabase.md` for account
creation and the `enable`/`disable` workflow. `scripts/fake-supabase-auth.mjs` remains as a
no-Docker fallback but is no longer the primary path.

```bash
# One command block: the stub dies when the shell exits.
node scripts/fake-supabase-auth.mjs --port 54321 \
  --user 08060c19-8a55-4046-a2e7-7384808dd81c \
  --user-for empty@example.com=3f2504e0-4f89-41d3-9a0c-0305e82c3301 &
# fake `supabase status` on PATH, then:
PATH=/tmp/fakebin:$PATH node scripts/local-supabase.mjs enable
E2E_EMAIL=audit@example.com E2E_PASSWORD=anything \
E2E_EMPTY_EMAIL=empty@example.com E2E_EMPTY_PASSWORD=anything \
  npx playwright test e2e/accessibility.spec.ts
node scripts/local-supabase.mjs disable    # ALWAYS restore the real config afterwards
```

## Defects found and fixed

| #   | Finding                                                                                                                                                                             | Severity     | Where                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| 1   | Calendar `role="grid"` had `columnheader`/`gridcell` as direct children with no `role="row"`                                                                                        | **critical** | `components/calendar/CalendarMonthGrid.tsx`                       |
| 2   | Calendar expense indicator at 3.38:1 (`--chart-expense` on `--paper`)                                                                                                               | serious      | `pages/CalendarPage.css`                                          |
| 3   | Calendar income indicator at 4.24:1 (`--chart-income`)                                                                                                                              | serious      | `pages/CalendarPage.css`                                          |
| 4   | Import disabled-card heading 4.43:1 and small print 2.63:1, caused by `opacity: 0.64` on the card                                                                                   | serious      | `import/import.css`                                               |
| 5   | Dashboard charts held focusable nodes inside `aria-hidden` (recharts renders `<g tabindex="-1">` for pie sectors, hardcoded, no prop to remove)                                     | serious      | `components/dashboard/SpendingByCategory.tsx`, `MonthlyTrend.tsx` |
| 6   | Assistant loading and error states rendered no `h1`                                                                                                                                 | serious      | `pages/AssistantPage.tsx`                                         |
| 7   | Provider comparison table unreachable by keyboard at 768px                                                                                                                          | serious      | `components/planning/RemittanceCalculatorSection.tsx`             |
| 8   | Calendar `role="separator"` wrapped a button. axe's `nested-interactive` fires on any role with `childrenPresentational: true`, which ARIA sets for `separator`                     | moderate     | `pages/CalendarPage.tsx`                                          |
| 9   | Review prompt (fixed 410px panel) covered primary data on 6 of 9 pages — the ledger's Amount column, budget inputs, the plan's spread column — and truncated two sentences mid-word | P1 UX        | `components/reviews/CustomerReviewPrompt.tsx`                     |
| 10  | Support launcher covered footer links on mobile                                                                                                                                     | moderate UX  | `components/layout/AppShell.css`                                  |
| 11  | Consent banner covered the last ~110px of every page                                                                                                                                | moderate UX  | `components/consent/cookieConsent.css`                            |

Findings 2, 3 and 5 were **masked by the defects above them** and only became measurable once those
were fixed — worth knowing when judging whether the list is complete.

### Things a reviewer should check hardest

1. **`CalendarMonthGrid.tsx`** — the JSX was restructured by a script that copies the original
   markup verbatim into a `renderDayCell` helper, wrapped in per-week `role="row"` elements. The
   7-column CSS grid moved from `.calendar-grid` to `.calendar-row`. Verify the calendar still lays
   out correctly and that roving-tabindex arrow-key navigation is unaffected.
2. **`CustomerReviewPrompt.tsx`** — converted from a non-modal docked panel to a modal
   (portal + `useRootLock` + `useFocusTrap` + backdrop). This changes product behaviour, not just
   CSS: the user must now answer or dismiss it. That trade-off was the user's explicit choice.
3. **`SpendingByCategory.tsx`** — `aria-hidden` was _removed_ from the donut wrapper rather than
   made honest, because recharts offers no way to strip the sector `tabindex`. The accessible
   equivalent is the adjacent category list. Confirm this is the right call.
4. **The harness guards** in `e2e/fixtures/accessibility.ts` — `waitForAppReady` and the
   `analyseVisible` refusal to measure an `inert` root or startup splash. These exist because the
   audit was previously reporting clean passes over hidden pages.

## Harness fixes worth understanding

Earlier rounds of this work produced false results. The audit now:

- waits for the startup splash to clear (it holds the app `inert` + `aria-hidden` for ~3s on every
  `/app` route, and reading the page before then measures the splash)
- refuses to analyse when `#root` or the startup content is `inert`, rather than reporting a clean
  pass over a page it never saw
- scopes axe to the viewport and scroll-steps, because off-screen elements fabricated 1.26:1
  contrast ratios on chat bubbles and hid a real 2.82:1 chip
- injects `animation: none`/`transition: none` before analysing, because mid-animation sampling
  produced shifting ratios
- treats one specific refusal (`404 assistant_not_enabled`) as expected **only** when nothing
  unexpected also failed, and correlates the browser's URL-less console echo to it

## Known open items

1. **Identity conflicts are fixed; the sign-out coupling is not.** `POST /api/app/identity`
   returned 500 whenever a stale row held the same `verified_email` under a different user id,
   because the upsert declared `ON CONFLICT(user_id)` while the table also has a unique index on
   `verified_email`. That broke every authenticated page for the affected user. The repository now
   releases the stale row first, verified against a live D1 runtime. Still open: `lib/api.ts` ends
   the session on any 401, so a transient failure on this optional identity sync signs the user out
   instead of degrading. That is a product decision, not an a11y one.
2. **Now verified against a real Supabase stack.** Docker was unavailable when this work began, so
   an emulated identity provider was used initially. The suite has since been re-run against a real
   local Supabase stack (db, auth, kong, rest, storage) and passes at all three widths, so these
   results no longer rest on the stub.
3. **advisories left in place:** `aria-allowed-role` on `.customer-review-prompt` and
   `landmark-unique` on `.sidebar`. Both are non-blocking and appear on every authenticated route.

## Verification evidence

| Check                                                                | Result                                  |
| -------------------------------------------------------------------- | --------------------------------------- |
| Unit suite                                                           | 233 files / 1820 tests passing          |
| Desktop accessibility spec (public + authenticated + states + empty) | 33 passed, 0 failed                     |
| Mobile authenticated (393px)                                         | 21 passed                               |
| 768px breakpoint authenticated                                       | 11 passed                               |
| Typechecks (app + e2e)                                               | exit 0                                  |
| Browser inspection                                                   | all 11 routes reviewed from screenshots |

No version numbers were edited: semantic-release owns them.
