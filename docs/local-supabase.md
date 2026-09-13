# Reviewing the app against a local Supabase

The web app and API normally run against the cloud Supabase project named in
`apps/web/.env.local` and `apps/api/.dev.vars`. That is fine for day-to-day work,
but it means the authenticated `/app/*` screens cannot be inspected in a browser
without a real account.

This document describes the local-Supabase route: the real Supabase stack running
in Docker, so the real sign-in, JWT, refresh and tenant-resolution paths are
exercised with no application code changes.

## Why not the dummy dev token?

`apps/api/src/auth.ts` accepts the literal token `dummy-dev-access-token` when the
environment is not production and the origin is localhost. It is live and
deliberately scoped to the mobile Dev build (`apps/mobile/src/auth/session-state.tsx`),
not dead code.

It is still the wrong tool for reviewing web screens: it maps every request to one
hard-coded `DEV_USER_ID`, so it creates no real session and proves nothing about
session handling or tenant resolution. It also bypasses real auth entirely, which
would mean adding a permanent dev-only branch to web auth to maintain.

Use it only if you specifically want mobile-style dummy data with no Supabase at all.

## Prerequisites

A container runtime. At the time of writing this machine has none:

```
docker       NOT RUNNING
supabase CLI: NOT AVAILABLE
```

Install Docker Desktop (or colima / OrbStack) and the Supabase CLI, then confirm:

```bash
docker info          # daemon reachable
supabase --version   # CLI present
```

## Steps

1. Start the local stack from the repo root and apply the storage migration:

   ```bash
   supabase start
   supabase db reset          # applies supabase/migrations/
   ```

2. Switch both apps onto it. This backs up the current cloud values first:

   ```bash
   node scripts/local-supabase.mjs status   # show what is configured now
   node scripts/local-supabase.mjs enable   # point api + web at 127.0.0.1:54321
   ```

   The script reads the URL and publishable key from `supabase status`, so no key is
   hardcoded. It refuses to run when a backup already exists, and it only ever writes
   a loopback URL.

3. Restart both dev servers, then create an account at `/signup` using the local
   stack. Copy the new user's UUID (`supabase status`, or the Auth table in Studio at
   http://127.0.0.1:54323).

4. Seed that user's D1 workspace so the screens have real data rather than empty
   states:

   ```bash
   node scripts/seed-local-workspace.mjs --user <uuid>
   ```

   This mirrors what the API bootstraps on the first authenticated request
   (`apps/api/src/db/tenants.ts`), so it is safe to run before or after that request.
   It is idempotent — every insert is `INSERT OR IGNORE` on a deterministic id
   prefixed `seed:` — and it creates roughly three months of transactions, five
   budgets, three subscriptions, a savings goal, a credit-card debt and two calendar
   events.

5. Sign in and review the app routes.

## Undo

```bash
node scripts/seed-local-workspace.mjs --user <uuid> --reset   # remove only seeded rows
node scripts/local-supabase.mjs disable                       # restore cloud config
```

`--reset` deletes only rows whose id starts with `seed:`, so hand-made data and the
workspace itself (tenant, accounts, categories) survive.

## What still will not work locally

These need external services and will fail or stay inert against the local stack:

| Area | Why |
|---|---|
| Assistant replies | DeepSeek is a networked, paid provider |
| Voice capture and playback | Fish Audio plus browser audio worklets |
| Checkout | PayPal is configured for sandbox |
| Signup confirmation / password reset email | Resend |
| Android release metadata | `downloads.zoption.site` rejects localhost origins with CORS |

Verify those as UI states only, not as live behaviour.

## Auditing without Docker: the auth stub

`supabase start` needs a container runtime. When one is not available, `scripts/fake-supabase-auth.mjs`
serves just enough of the GoTrue surface for the web client to sign in and for the API to verify
the token — the API already accepts a loopback Supabase and verifies through JWKS, so **no
application code changes are involved**.

```bash
# 1. the stub, on the port the API's e2e config already targets
pnpm audit:auth-stub -- --port 54321

# 2. point the web app at it (backed up, reversible)
#    the stub ignores the publishable key, so any non-empty value works
#    (see the fake-status note below, or set VITE_SUPABASE_URL by hand)

# 3. give the stub's user a workspace
node scripts/seed-local-workspace.mjs --user 08060c19-8a55-4046-a2e7-7384808dd81c

# 4. run the authenticated audit
E2E_EMAIL=audit@example.com E2E_PASSWORD=anything npx playwright test e2e/accessibility.spec.ts
```

The stub signs RS256 tokens with a keypair generated per process and publishes the matching JWKS,
so the API's verification path is exercised for real. **It is a test double, not a replacement:**
token lifetimes, refresh races and provider metadata still belong to the local-Supabase run above.
Nothing under `apps/` references it.

## Automated checks

`e2e/accessibility.spec.ts` (desktop) and `e2e/accessibility.mobile.spec.ts` (phone width)
run axe-core over the public routes always, and over the authenticated routes when a local
session is available. The suite **skips** the authenticated portion rather than failing when
Supabase is not running, so CI stays green without a stack.

Run the full authenticated pass with:

```bash
E2E_EMAIL=you@example.com E2E_PASSWORD=... pnpm test:e2e
```

What the authenticated pass covers, per route:

| State | Routes | Notes |
|---|---|---|
| Settled | all 11 `/app/*` routes | Also asserts the route rendered an `h1` and logged **no console errors** — a blank page or a redirect would otherwise pass a scan over nothing |
| Loading | 5 representative routes | Every API call is left unanswered so the skeletons stay on screen; they cannot be scanned once data arrives |
| Failed | 5 representative routes | Every API call is aborted, so the error panels render |
| Empty workspace | 3 routes | Needs a second, unseeded account: `E2E_EMPTY_EMAIL` / `E2E_EMPTY_PASSWORD`. Skips when unset |

Screenshots for the visual review pass are written to `test-results/app-audit/` (gitignored).
Reading them is part of the verification: every purely visual defect found so far — overlapping
elements, a wrapped label, a 16px heading — came from looking, not from axe.

Two things the specs do deliberately, because both once produced false confidence:

- They **refuse to analyse an inert `#root`**. `useRootLock` hides the page behind an overlay,
  and axe will happily report a clean pass over a page it never examined.
- They **scroll the page a viewport at a time and keep only on-screen findings**. axe guesses
  the backdrop of off-screen elements and produced fabricated contrast failures, while the
  same run hid a real one below the fold.
