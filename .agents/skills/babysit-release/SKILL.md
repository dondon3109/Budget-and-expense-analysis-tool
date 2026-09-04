---
name: babysit-release
description: Babysit the automatic web and Android release workflows by polling Production Release, Android Beta Build, and Mobile OTA runs until each goes green or needs user help.
---

# Release Babysitter

## Objective

Babysit automatic releases persistently until every in-scope workflow reaches a
terminal outcome:

- Web (`Production Release`): semantic-release tag published + Worker/Pages
  deployed + production smoke green.
- Android (`Android Beta Build`): signed APK build green (+ public R2 APK and
  `android/latest.json` verified, when publishing was approved).
- OTA (`Mobile OTA Update`, when dispatched): EAS update published.

Like `babysit-pr`, fix source-related failures forward and re-release: patch
the code, verify locally, commit, push, and resume watching the new run in
the same turn. A fix push is a progress event, never a stop.

Stop only for a terminal outcome or a blocker that needs Don. Do not stop on a
single `idle`/pending snapshot.

## Inputs

Accept any of the following:

- No argument: watch the latest `main` release activity (CI run on `main`,
  open `Production Release` run, latest manual `Android Beta Build` /
  `Mobile OTA Update` dispatch).
- Workflow run ID or URL.
- Commit SHA on `main`.

## Core Workflow

1. When Don asks to monitor, watch, or babysit a release, start with the
   watcher's continuous mode (`--watch`) unless intentionally doing a
   one-shot diagnostic snapshot. Keep consuming watcher output in the same
   turn; do not leave a detached `--watch` process running and then end the
   turn as if monitoring were complete.
2. Identify the in-scope runs: the `CI` run for the `main` SHA, the
   `Production Release` run triggered by it, and any dispatched
   `Android Beta Build` / `Mobile OTA Update` runs for the same source.
3. On every loop, snapshot all three tracks before acting:
   `gh run list --workflow=ci.yml`, `release.yml`, `android-beta.yml`,
   `mobile-ota.yml`, plus `gh run view <id>` for the active runs.
4. For web, also check the GitHub deployment record
   (`scripts/github-production-deployment.mjs` stages: begin, worker, pages,
   finish) and the live endpoints: `https://zoption.site`,
   `https://api.zoption.site`, `https://downloads.zoption.site/android/latest.json`.
5. Diagnose failures from failed-job logs first
   (`gh run view <run-id> --json jobs`, then the Actions job-logs endpoint for
   the failed `job_id`; `gh run view <run-id> --log-failed` only after the run
   finishes).
6. Classify each failure as source-related vs flaky/infra (see below) and act
   accordingly. If source-related, fix forward and re-release (see below),
   then keep polling the new run in the same turn. If flaky/infra, rerun
   failed jobs first; only fix forward when reruns prove it is not a flake.
7. Never manually deploy the production Worker/Pages while
   `Production Release` is running, and never enable the Android
   `publish_apk` / `publish_latest_json` inputs or dispatch OTA without
   Don's explicit approval for that version. Fix-forward pushes to `main`
   are allowed under the Safety Rules below; that approval does not extend
   to publish inputs or OTA dispatch.
8. Report status changes concisely plus occasional heartbeats; emit the final
   summary only at a strict stop condition.

## Commands

### One-shot snapshot

```bash
python3 .agents/skills/babysit-release/scripts/gh_release_watch.py --sha auto --once
```

### Continuous watch (JSONL) — the default for babysitting

```bash
python3 .agents/skills/babysit-release/scripts/gh_release_watch.py --sha auto --watch
```

### Trigger flaky retry cycle (only when watcher indicates)

```bash
python3 .agents/skills/babysit-release/scripts/gh_release_watch.py --sha auto --retry-failed-now
```

### Explicit SHA or expected live version

```bash
python3 .agents/skills/babysit-release/scripts/gh_release_watch.py --sha <main-sha> --once
python3 .agents/skills/babysit-release/scripts/gh_release_watch.py --sha auto --expect-version 2.2.2 --watch
```

Raw fallbacks when the watcher needs backup:

```bash
gh run list --workflow=ci.yml --branch=main --limit 5
gh run view <run-id> --json jobs,name,workflowName,conclusion,status,url,headSha
gh run view <run-id> --log-failed
node scripts/next-semantic-release.mjs
pnpm smoke:production
curl -fsS https://downloads.zoption.site/android/latest.json
```

Local read-only verifiers (safe while workflows run):

```bash
node scripts/validate-deployment-config.mjs
node scripts/export-production-deployment-env.mjs
node scripts/refresh-android-release-snapshot.mjs
```

## Web Track (`Production Release`, `.github/workflows/release.yml`)

Trigger: `workflow_run` on `CI` success for a `main` push. Concurrency group
`production-release-main`, `cancel-in-progress: false`.

Stage order: verify release source (stale-SHA + `vX.Y.Z` baseline tag) ->
`scripts/next-semantic-release.mjs` decides `release_needed` -> deployment
authority and config validation -> `github-production-deployment.mjs begin` ->
D1 migrations -> Worker deploy -> stage worker -> Pages build/deploy
(`clarity-budget`, commit `main`) -> stage pages ->
`scripts/wait-for-production-release.mjs` -> `pnpm smoke:production` ->
`github-production-deployment.mjs finish` -> `pnpm release` (semantic-release).

Done means: GitHub Release/tag `vX.Y.Z` exists, deployment record is
`success`, and production smoke passes at the expected version. If
`release_needed` is `false` (only `docs:`/`test:`/`chore:`/`refactor:`/
`style:`/`ci:`/`build:` commits), no deployment is the correct terminal state.

## Android Track (`Android Beta Build`, `.github/workflows/android-beta.yml`)

Manual `workflow_dispatch` only; read-only over the repo, never commits.
Inputs `publish_apk` and `publish_latest_json` stay `false` for validation
runs and flip only with explicit release approval.

Identity rule: a release bump edits exactly two files,
`apps/mobile/package.json` (version name) and `apps/mobile/app.config.ts`
(Android `versionCode`); every published value derives from that pair.

Gate order: production config export -> telemetry validation -> release
identity -> OTA fingerprint -> prebuild -> keystore -> `assembleRelease` ->
APK signing gate (SHA-256 `f94670eb9411f3da683a1333dd7f6c6958b0083ccec47e75894c38dbc6a5a58d`,
DN `CN=Zoption, O=Zoption, C=PH`, single signer, package/version match) ->
digest -> optional R2 publish -> public-object re-verification ->
`android/latest.json` published last with `no-store`, then publicly verified.

After a verified `latest.json` publish, the required follow-up is a separate
repo commit: `node scripts/refresh-android-release-snapshot.mjs --write`,
review `apps/web/src/releases/androidRelease.json`, commit as
`fix(web): refresh Android install snapshot`, and let `Production Release`
deploy it. The script rejects versionCode downgrades unless the rollback was
approved with `--allow-downgrade`.

## OTA Track (`Mobile OTA Update`, `.github/workflows/mobile-ota.yml`)

Manual dispatch with `message` plus `confirm_ota_trust_boundary: true`. Only
JS/asset changes; native, permission, SDK, or config-plugin changes need a
new signed APK instead. Gates: main-only source, OTA trust confirmation, live
OTA-capable APK with matching `otaRuntimeVersion`/fingerprint/certificate,
`OTA_BASE_COMMIT` ancestor of the update SHA, current `main` SHA, and
successful CI for that SHA.

## Failure Classification

Prefer source-related when logs point at changed code (compile, typecheck,
lint, unit/e2e, snapshot, migration, signing identity, version mismatch,
telemetry config, Pages/Worker build).

Prefer flaky/infra when logs show timeouts, runner provisioning, registry or
network outages, or Actions infra errors. Rerun failed jobs for flakes
(`gh run rerun <run-id> --failed`), up to 3 cycles; do not edit tests, build
scripts, CI config, pins, or infra code to force green.

## Fix Forward and Re-release

When a failure is source-related (failed logs point at landed code), resolve
it the way `babysit-pr` resolves branch failures:

1. Patch the code locally. Before editing, check for unrelated uncommitted
   changes; if present, stop and ask Don instead of mixing concerns.
2. Verify the fix locally with the same check that failed (`pnpm lint`,
   `pnpm typecheck`, the failing test, or the failing build) before pushing.
3. Commit with a `feat:`/`fix:` type so semantic-release picks it up for the
   re-release (e.g. `fix(web): ...`). Never use `[skip ci]`.
4. Push to `main` (forward-only; never force-push), then immediately relaunch
   `--watch` in the same turn: the push retriggers CI, and CI success
   retriggers `Production Release` automatically. A fix push is not a
   completion event.
5. For `Android Beta Build` failures: dispatch workflows do not retrigger on
   push, so after the fix lands, re-dispatch build-only validation with
   `gh workflow run android-beta.yml` (defaults keep both publish inputs
   `false`). Publish inputs still need Don's per-version approval.
6. Never auto-dispatch `Mobile OTA Update` (its trust confirmation must come
   from Don); fix the source, report readiness, and wait.

Stop for Don when: secrets/vars missing, Cloudflare Git deploy not disabled,
stale SHA, missing baseline tag, signing-certificate mismatch, public
R2/latest.json mismatch, `main` advanced mid-run, CI not successful for an
OTA, retry budget exhausted, or any publish-gate failure. Publish-gate
failures are never fixed by republishing over the bad object.

## Safety Rules

- Fix-forward pushes to `main` are part of the job (see Fix Forward and
  Re-release). Guard them: forward-only, never force-push; only the fix
  commit goes in the push; no `[skip ci]`; no manual `wrangler deploy`/
  `pages deploy`/D1 apply against production while the workflow runs
  (emergency recovery only, and never concurrently with it).
- No Android publish inputs and no OTA dispatch without explicit approval for
  that exact version and notes.
- No resolving human review threads, no closing/reopening runs, no
  deleting/replacing R2 objects outside the workflow.
- Keep one polling loop per release; do not stack concurrent watchers for the
  same run.

## Monitoring Loop Pattern

1. Run `--watch` and consume each streamed snapshot; read its `actions` list.
2. If `diagnose_ci_failure` / `diagnose_release_failure` /
   `diagnose_android_failure` / `diagnose_ota_failure` is present, fetch the
   failed job's logs from the snapshot's `logs_endpoint` and classify
   source-related vs flaky/infra. Fix forward when source-related; rerun
   with `--retry-failed-now` only when `retry_failed_checks` is present and
   the failure looks flaky.
3. If `check_release_needed` is present (green CI, skipped release), run
   `node scripts/next-semantic-release.mjs` to decide no-op vs guard trip.
4. If `verify_production` is present (release success, live version lagging),
   keep watching; run `pnpm smoke:production` for an independent check.
5. After any push, rerun, or re-dispatch, relaunch `--watch` yourself in the
   same turn; do not wait for Don to re-invoke the skill.
6. If a `--watch` process is still running and no strict stop condition has
   been reached, the babysitting task is still in progress; keep
   streaming/consuming instead of ending the turn.
7. Stop only when the watcher emits `stop_released` /
   `stop_exhausted_retries`, or a blocker needs Don. A green snapshot that is
   not a stop event is a progress update, not a reason to end the watch.

## Polling Cadence

The watcher polls every 60 seconds by default (`--poll-seconds`), matching
this cadence:

- While any in-scope run is pending/running/failing: poll every 1 minute.
- When all green but terminal publication not yet confirmed (tag, deployment
  record, public `latest.json`): keep the 1-minute cadence.
- Reset the cadence on any change (new SHA, status change, new dispatch,
  deployment-stage change, live-endpoint version change).
- After the first all-green snapshot for the current SHA, emit one
  celebratory progress line, then stay on watch until the strict stop below.

## Stop Conditions (Strict)

Stop only when one of these is true:

- All in-scope tracks terminal green (web tag + deployment + smoke;
  Android build, plus public verifications when publishing was approved;
  OTA published when dispatched).
- Correct no-op: web `release_needed` is `false` and Android/OTA were not
  dispatched.
- A blocker above needs Don.

Keep polling while runs are queued/running, while smoke or public
verification is unconfirmed, while the website snapshot refresh commit has
not landed after an Android publish, and while a rerun/dispatch you
triggered is still in flight.

## Output Expectations

Progress updates on status changes plus heartbeats; final summary with: SHAs
watched, per-track run conclusions + URLs, published tag/version (or no-op
reason), deployment-record state, smoke and public-verification results,
snapshot-refresh commit (Android publish), fix commits pushed, reruns and
re-dispatches used, and remaining blockers.
