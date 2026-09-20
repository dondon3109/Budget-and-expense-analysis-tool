# Reviewing the app against a local Supabase

The web app and API normally run against the cloud Supabase project named in
`apps/web/.env.local` and `apps/api/.dev.vars`. That is fine for day-to-day work,
but it means the authenticated `/app/*` screens cannot be inspected in a browser
without a real account.

This document describes the local-Supabase route: the real Supabase stack running
in Docker, so the real sign-in, JWT, refresh and tenant-resolution paths are
exercised with no application code changes. It is the more thorough of the two routes.
The auth stub near the end runs the same audit with no container runtime, and it is the
route this checkout uses, because Docker is not running here. The identity 500 that once
made an authenticated run unreadable is fixed; see the note below.

## Why not the dummy dev token?

`apps/api/src/auth.ts` accepts the literal token `dummy-dev-access-token` only when
`DEV_ACCESS_TOKEN_ENABLED=true`, `POSTHOG_AI_ENVIRONMENT` is not `production`, and the
request arrives on an exact loopback origin (`http://localhost`, `http://127.0.0.1` or
`http://[::1]`). Nothing in a deployed environment sets that binding, so the shortcut is
off unless a developer opts in. It is live and deliberately scoped to the mobile Dev
build (`apps/mobile/src/auth/session-state.tsx`), not dead code.

It is still the wrong tool for reviewing web screens: it maps every request to one
hard-coded `DEV_USER_ID`, so it creates no real session and proves nothing about
session handling or tenant resolution. It also bypasses real auth entirely, which
would mean adding a permanent dev-only branch to web auth to maintain.

Use it only if you specifically want mobile-style dummy data with no Supabase at all.

## Prerequisites

Installed with Homebrew (already present); all binaries are in `/opt/homebrew/bin`:

| Tool         | Version                  |
| ------------ | ------------------------ |
| colima       | 0.10.3 (with lima 2.2.0) |
| docker CLI   | 29.8.0                   |
| supabase CLI | 2.117.0                  |

The container runtime is colima, not Docker Desktop. Start it first — no `docker`
or `supabase` command works until the VM is up:

```bash
colima start --cpu 4 --memory 6 --disk 30
docker info          # daemon reachable
supabase --version   # CLI present
```

The limits are deliberately modest: the host has 8 GB RAM and only about 11 GB free
disk.

### Image pulls fail: the leftover `credsStore`

`~/.docker/config.json` still carried `"credsStore": "desktop"`, left behind by a
Docker Desktop install that no longer exists. `docker-credential-desktop` is
therefore missing, and **every image pull** failed with:

```
error getting credentials - err: exec: "docker-credential-desktop": executable file not found in $PATH
```

Removing the `credsStore` key fixes it. The original file is backed up at
`~/.docker/config.json.zoption-backup`.

## Steps

1. Start the stack from the repo root, excluding the services Zoption does not use:

   ```bash
   supabase start -x studio,edge-runtime,logflare,vector,supavisor,realtime,mailpit,postgres-meta
   ```

   Zoption keeps its data in Cloudflare D1 and uses Supabase for authentication only,
   so the running services are `db`, `auth`, `kong`, `rest` and `storage`. Excluding
   the rest matters for disk and RAM.

   On a first run, `supabase db reset` applies `supabase/migrations/` (the avatar
   storage bucket). It recreates the database, so run it before creating accounts.

2. Create an account with the GoTrue admin API. Local signup requires email
   confirmation and mailpit is excluded, so `/auth/v1/signup` cannot be used. Read the
   keys from the running stack, then POST with the service role key in **both** the
   `apikey` and `Authorization` headers:

   ```bash
   supabase status -o json   # SERVICE_ROLE_KEY, ANON_KEY, API_URL

   curl -sS -X POST http://127.0.0.1:54321/auth/v1/admin/users \
     -H 'Content-Type: application/json' \
     -H 'apikey: <service-role-key>' \
     -H 'Authorization: Bearer <service-role-key>' \
     -d '{"email":"audit@example.com","password":"Audit-Pass-1234!","email_confirm":true}'
   ```

   Local passwords must satisfy GoTrue's policy: at least one lowercase, uppercase,
   digit and symbol character. Two throwaway accounts already exist for the audit and
   are safe to reuse:

   | Email               | Password           | UUID                                   |
   | ------------------- | ------------------ | -------------------------------------- |
   | `audit@example.com` | `Audit-Pass-1234!` | `d56d6661-1c15-43a0-9faa-5909d3e2053a` |
   | `empty@example.com` | `Empty-Pass-1234!` | `6db3a570-0636-4761-906e-fa6309e857a1` |

3. Switch both apps onto it. This backs up the current cloud values first:

   ```bash
   node scripts/local-supabase.mjs status   # show what is configured now
   node scripts/local-supabase.mjs enable   # point api + web at 127.0.0.1:54321
   ```

   The script reads the URL and publishable key from `supabase status -o json`, so no
   key is hardcoded, and it only ever writes a loopback URL. It writes
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the API, plus
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the web app.

   Four caveats:

   - `enable` needs `apps/api/.dev.vars` to exist before it can write the API pair.
     That file is gitignored, so a fresh checkout has only
     `apps/api/.dev.vars.example`, and `enable` exits non-zero
     ("... is missing; cannot switch it.") rather than creating it. Copy
     the example first: `cp apps/api/.dev.vars.example apps/api/.dev.vars`. Its provider
     values are empty, so the live-credential check below still passes.

   - `enable` refuses to run while `apps/api/.dev.vars` still defines a live
     non-Supabase credential — `DEEPSEEK_API_KEY`, `FISH_AUDIO_API_KEY`,
     `RESEND_API_KEY`, `PAYPAL_CLIENT_SECRET` and the other provider keys. It
     replaces only the Supabase pair, so the dev Worker would keep spending those real
     accounts. The error names every key it found; comment out the ones local work does
     not need, or pass `--allow-live-keys` to accept the risk. `status` prints the
     same list as a warning.

   - `enable` refuses to run while a backup exists, and that is deliberate: run
     `disable` first. Do **not** use `--force` — it overwrites the cloud backup with
     the local values, so the cloud configuration is lost.
   - The API's publishable key matters as much as the URL, and `apps/api/.dev.vars` is
     what carries it. Without that key the Worker falls back to a placeholder in
     `apps/api/wrangler.e2e.jsonc`, which a real GoTrue rejects: `POST /api/app/identity`
     then answers 503 (`identity_verification_unavailable`), not 500.

4. Restart both dev servers.

5. Seed the audit account's D1 workspace so the screens have real data rather than
   empty states:

   ```bash
   node scripts/seed-local-workspace.mjs --user d56d6661-1c15-43a0-9faa-5909d3e2053a
   ```

   This mirrors what the API bootstraps on the first authenticated request
   (`apps/api/src/db/tenants.ts`), so it is safe to run before or after that request.
   It is idempotent — every insert is `INSERT OR IGNORE` on a deterministic id
   prefixed `seed:` — and it creates roughly three months of transactions, five
   budgets, three subscriptions, a savings goal, a credit-card debt and two calendar
   events.

6. Run the authenticated audit (or sign in and review the app routes by hand):

   ```bash
   E2E_EMAIL=audit@example.com E2E_PASSWORD='Audit-Pass-1234!' \
   E2E_EMPTY_EMAIL=empty@example.com E2E_EMPTY_PASSWORD='Empty-Pass-1234!' \
     npx playwright test e2e/accessibility.spec.ts
   ```

## Fixed: `POST /api/app/identity` returned 500

`syncVerifiedIdentity` upserted with `ON CONFLICT(user_id)` while
`app_user_identities` also carries a unique index on `verified_email`. When a stale
row already owned the same email under a different user id, the insert raised
`SQLITE_CONSTRAINT`, which is not an `HttpError` and so escaped as a bare **HTTP
500** on every authenticated page load. Commit `b0fb418` releases that stale row
before recording the identity, in the same transaction. The regression test is
`apps/api/tests/platform-admin.test.ts` ("releases a stale row that owns the same email
under another user id"), and `docs/a11y-remediation-review.md` holds the history and
the re-verification against a real stack. A 500 here today is a regression, not a known
state.

## Undo

```bash
node scripts/seed-local-workspace.mjs --user <uuid> --reset   # remove only seeded rows
node scripts/local-supabase.mjs disable                       # restore cloud config
```

`--reset` deletes only rows whose id starts with `seed:`, so hand-made data and the
workspace itself (tenant, accounts, categories) survive.

## What still will not work locally

These need external services and will fail or stay inert against the local stack:

| Area                                       | Why                                                          |
| ------------------------------------------ | ------------------------------------------------------------ |
| Assistant replies                          | DeepSeek is a networked, paid provider                       |
| Voice capture and playback                 | Fish Audio plus browser audio worklets                       |
| Checkout                                   | PayPal is configured for sandbox                             |
| Signup confirmation / password reset email | Resend                                                       |
| Android release metadata                   | `downloads.zoption.site` rejects localhost origins with CORS |

Verify those as UI states only, not as live behaviour.

## Auditing without Docker: the auth stub

`scripts/fake-supabase-auth.mjs` serves just enough of the GoTrue surface for the
web client to sign in and for the API to verify the token — the API already accepts a
loopback Supabase and verifies through JWKS, so **no application code changes are
involved**. It runs the same specs as the Docker route without a container runtime, and
it is the route used in this checkout.

Run from the repo root:

1. Put the stub's URL in `apps/web/.env.local`:

   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local-test-key
   ```

   The stub ignores the key, so any non-empty value works. `.env.*` and `.dev.vars` are
   gitignored (`.env.example` and `apps/web/.env.production` are not), so this file stays
   local to your checkout. `node scripts/local-supabase.mjs enable` cannot write it: it
   reads a real `supabase status`, which needs the container runtime this route avoids.

2. Start the stub in its own terminal, with two identities:

   ```bash
   node scripts/fake-supabase-auth.mjs --port 54321 \
     --user 08060c19-8a55-4046-a2e7-7384808dd81c \
     --user-for empty@example.com=1f0e6a2c-3b4d-4e5f-8a90-1234567890ab
   ```

   `--user-for` is what gives the empty-workspace audits an account whose tenant holds no
   data, and it only takes effect as a UUID different from `--user`. Leave this terminal
   running.

3. Apply the local D1 migrations:

   ```bash
   pnpm db:migrate:local
   ```

4. Seed the audited account's workspace:

   ```bash
   node scripts/seed-local-workspace.mjs --user 08060c19-8a55-4046-a2e7-7384808dd81c
   ```

5. Run the audit:

   ```bash
   pnpm test:e2e:stub                            # every spec
   pnpm test:e2e:stub e2e/accessibility.spec.ts  # one spec
   ```

   `pnpm test:e2e:stub` (`scripts/local-audit.mjs`) supplies the four `E2E_*` variables
   the fixtures read — `audit@example.com` / `Audit-Pass-1234!` and
   `empty@example.com` / `Empty-Pass-1234!`, though the stub accepts any password —
   passes extra arguments through to Playwright, exits with Playwright's exit code and
   prints the screenshot path at the end. It **refuses to run** when the stub is not
   answering `GET http://127.0.0.1:54321/auth/v1/health`, naming the command to start;
   it refuses too when `apps/web/.env.local` is missing or does not point
   `VITE_SUPABASE_URL` there, printing the exact file contents to write. That check is
   the point: without the stub, Playwright skips every authenticated test and still exits
   0, so a green run would otherwise mean nothing.

On 2026-09-20 this sequence passed green end to end: 39 accessibility tests, 0 skipped,
no blocking axe findings.

The stub signs RS256 tokens with a keypair generated per process and publishes the
matching JWKS, so the API's verification path is exercised for real. **It is a test
double, not a replacement:** token lifetimes, refresh races and provider metadata
still belong to the local-Supabase run above. Nothing under `apps/` references it.

## Automated checks

`e2e/accessibility.spec.ts` (desktop) and `e2e/accessibility.mobile.spec.ts` (phone
width) run axe-core over the public routes always, and over the authenticated routes
when a local session is available. The suite **skips** the authenticated portion rather
than failing when Supabase is not running, so CI stays green without a stack — which is
why `pnpm test:e2e:stub` refuses to start without one.

Run the full suite with:

```bash
pnpm test:e2e:stub   # against the auth stub; refuses to start without it
pnpm test:e2e        # every project; set the four E2E_* variables for the authenticated half
```

Playwright reads those four variables from the process environment, and
`playwright.config.ts` loads an optional `.env.e2e` beside itself for exactly that reason.
A variable already exported wins over the file, and the file is gitignored:

```
E2E_EMAIL=audit@example.com
E2E_PASSWORD=Audit-Pass-1234!
E2E_EMPTY_EMAIL=empty@example.com
E2E_EMPTY_PASSWORD=Empty-Pass-1234!
```

Those are the local accounts above. `.env` and `apps/web/.env.local` are not read for them, so
put them on the command line, export them, write `.env.e2e`, or let `pnpm test:e2e:stub` supply
them as it does already. Whichever you choose, the credentials have to match the auth provider the
checkout points at: `audit@example.com` exists on the local stack and on the stub, never in
production. Without them the authenticated half skips and the run still exits 0.

`pnpm test:e2e` first applies the local D1 migrations (`pnpm test:e2e:prepare`),
then runs every Playwright project. The authenticated pass covers, per route:

| State           | Routes                  | Notes                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settled         | all 11 `/app/*` routes  | Also asserts the route rendered an `h1`, made **no failed requests** and logged **no console errors** — a blank page, a redirect or a refused API call would otherwise pass a scan over nothing. The identity 500 that used to trip this is fixed — see the note above |
| Loading         | 5 representative routes | Every API call is left unanswered so the skeletons stay on screen; they cannot be scanned once data arrives                                                                                                                                                            |
| Failed          | 5 representative routes | Every API call is aborted, so the error panels render                                                                                                                                                                                                                  |
| Empty workspace | 3 routes                | Needs a second, unseeded account: `E2E_EMPTY_EMAIL` / `E2E_EMPTY_PASSWORD`. Skips when unset                                                                                                                                                                           |

Screenshots for the visual review pass are written to `test-results/app-audit/` (gitignored).
Reading them is part of the verification: every purely visual defect found so far — overlapping
elements, a wrapped label, a 16px heading — came from looking, not from axe.

Two things the specs do deliberately, because both once produced false confidence:

- They **refuse to analyse an inert `#root`**. `useRootLock` hides the page behind an overlay,
  and axe will happily report a clean pass over a page it never examined.
- They **scroll the page a viewport at a time and keep only on-screen findings**. axe guesses
  the backdrop of off-screen elements and produced fabricated contrast failures, while the
  same run hid a real one below the fold.
