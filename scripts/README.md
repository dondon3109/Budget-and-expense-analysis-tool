# scripts

Repository tooling. Every `*.mjs` with logic has a `*.test.mjs` beside it, collected by the
root Vitest `scripts` project (`pnpm vitest run --project scripts`).

## Verification and guardrails

| Script                   | Run by                          | Purpose                                                                               |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------- |
| `verify-workspace-links` | `pnpm verify`, `verify:changed` | Proves the `@zoption/*` workspace links exist before anything typechecks              |
| `check-structure`        | `pnpm verify`, CI `static`      | Enforces the 1000 line file limit (with shrink-only ceilings) and one-line app routes |
| `verify-changed`         | `pnpm verify:changed`           | Runs only the scoped `verify:<scope>` commands the current diff needs                 |
| `bugfix-scrub`           | Bugfix Draft workflow           | Fails a bugfix draft that carries user identifiers                                    |

## Release and deployment (run by workflows)

| Script                             | Workflow                     | Purpose                                                                                |
| ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `next-semantic-release`            | Production Release           | Turns the semantic-release dry run into workflow outputs                               |
| `validate-deployment-config`       | Production Release           | Checks `apps/api/wrangler.deploy.jsonc` has every required variable                    |
| `export-deployment-env`            | Production Release, Android  | Exports one environment's public build and smoke values from the Wrangler config       |
| `github-production-deployment`     | Production Release           | Records the GitHub deployment and its stage statuses                                   |
| `wait-for-production-release`      | Production Release           | Waits until the deployed site reports the expected app version                         |
| `smoke-production`                 | `pnpm smoke:production`      | Read-only smoke checks of production or preview; uses `deployment-smoke-helpers`       |
| `worker-canary`                    | Production Release           | Plans, probes, and soaks the gradual production Worker rollout                         |
| `rollback-pages`                   | Production Rollback          | Rolls a Pages project back to the production deployment of a release commit            |
| `submit-indexnow`                  | Production Release           | Submits the live sitemap URLs to IndexNow (Bing) after a deploy; never fails a release |
| `android-release-metadata`         | Android Beta Build           | Resolves the signed Android release identity from the two version sources              |
| `validate-mobile-telemetry-env`    | Android Beta Build           | Rejects a release build with an unapproved PostHog host or flag                        |
| `refresh-android-release-snapshot` | By hand after an APK release | Refreshes `packages/web-common/src/releases/androidRelease.json` from the live release |
| `freeze-mobile-sync-contract`      | By hand at a mobile bump     | Records a release's sync contract for the API compatibility test                       |
| `r2-android-cors.json`             | By hand                      | The R2 CORS rules for the APK bucket (`docs/deployment.md`)                            |

## Local development

| Script                  | Command                                 | Purpose                                                           |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `ensure-adb-reverse`    | `pnpm mobile:*`                         | Maps device ports 8081 and 8787 to the host for a USB device      |
| `local-supabase`        | `pnpm supabase:local`                   | Switches web and API between cloud and a Docker Supabase stack    |
| `fake-supabase-auth`    | `pnpm audit:auth-stub`                  | Dependency-free Supabase Auth stand-in for signed-in local audits |
| `local-audit`           | `pnpm test:e2e:stub`                    | Runs the authenticated accessibility audit against the auth stub  |
| `seed-local-workspace`  | `pnpm seed:local`                       | Seeds a local D1 workspace with realistic data                    |
| `a11y-source-audit`     | `pnpm audit:a11y`                       | Source-level accessibility checks for routes axe cannot reach     |
| `setup-paypal-sandbox`  | `pnpm paypal:sandbox:setup`             | Creates the sandbox PayPal product, plan, and webhook             |
| `setup-paypal-live`     | `pnpm paypal:live:setup`                | Creates or verifies the live PayPal product, plan, and webhook    |
| `arm-bugfix-automation` | `bash scripts/arm-bugfix-automation.sh` | Stores the bugfix automation secrets only Don can create          |
