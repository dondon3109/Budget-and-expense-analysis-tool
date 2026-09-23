# 0001 · Bug report to draft pull request automation

**Status**: Assumed
**Date**: 2026-09-21
**Authorized by**: Don, during /develop

## Owed decision

How a bug report becomes a draft pull request without handing the automation a
credential that can write to the main branch.

## Assumption built on

`.github/workflows/bugfix.yml` is its own orchestrator. A 15 minute schedule
runs a `claim` job that takes at most one report from the egress list, so the
claim and the draft happen in one run and no credential outside a runner can
start anything. n8n and its fine grained dispatch token were removed on
2026-09-23: they held no triage, and a report claimed by n8n whose dispatch
failed was never offered again. Human approval sits at the pull request, which
the `main review gate - PR required` ruleset enforces, and a `notify` job sends
the outcome to Telegram with links only.

Two jobs then do the work that touches the repository:

1. `draft`, with `permissions: contents: read`. Runs the DSH harness to
   produce a patch and a pull request body, then checks its own output with the
   project detector before uploading both as an artifact. This job holds the
   model key. It holds no write token, so it cannot push anywhere.
2. `open-pr`, with `contents: write`, `pull-requests: write`, and
   `actions: write`. Applies the patch to a branch and opens a draft pull
   request. It runs no model and reads no user text.

Shadow mode is the repository variable `OPEN_BUGFIX_PRS`. Unset means the
`open-pr` job is skipped and the artifact is the draft.

The organization, the fork repository, and the GitHub App are removed. They
existed only to keep a write credential away from main, and there is no longer
a write credential outside a runner.

Decisions recorded here that are not obvious:

- The egress endpoint returns only reports with no `bug_report_egress_audit`
  row, so the caller holds no state and a retry is safe.
- The same endpoint answers `?id=<reportId>` for a single report even when it
  already crossed, because the workflow reads a report the poller already
  claimed. It re-runs the same redaction, so raw text still never leaves.
- The patch is checked with `detectIdentifierLeaks` on added lines only, for
  email addresses and phone numbers. Addresses under the RFC 2606 reserved
  names (`example.com`, `.test`, and the like) pass, because test fixtures
  need them and no real user can own one.
- Claude Code headless (`claude -p`, model `claude-opus-5`) is the harness,
  replacing `dsh` on 2026-09-23, limited to file tools and `pnpm vitest run`.
  Any harness that runs one task without a terminal, reads its key from the
  environment, and edits files in the working directory can replace it by
  changing one step.
- A pull request opened with the run token does not trigger `pull_request`
  workflows, so `ci.yml` gains a `workflow_dispatch` trigger and the
  `open-pr` job starts it. That trigger is the documented exception to the
  event cascade rule.

## Code area

- `apps/api/src/db/bug-reports.ts`, `apps/api/src/routes/ops-bug-report-egress.ts`
- `.github/workflows/bugfix.yml`, `.github/workflows/ci.yml`
- `scripts/bugfix-scrub.mjs`
- `docs/deployment.md`

## Requirements

1. A report that already crossed egress is not served again by the list mode.
2. A single report can still be read by id, scrubbed, after it crossed.
3. No job that reads user text holds a repository write credential.
4. A draft pull request exists per actionable report once shadow mode is off.
5. A patch that does not apply, or that touches the workflow files, the
   lockfile, or `scripts/`, opens nothing.
6. The generated pull request runs the repository CI checks.
7. The model harness is replaceable without touching the security boundary.

## Ratify

Deliberated with Don in session on 2026-09-21 and recorded here by /develop.
Run `/architect bug report fix automation` to ratify it or supersede it.
