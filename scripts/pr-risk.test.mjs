import { describe, expect, it } from "vitest";

import { highRiskPaths } from "./pr-risk.mjs";

describe("highRiskPaths", () => {
  it("flags the automation, money, auth, billing, and schema paths", () => {
    const risky = [
      ".github/workflows/pr-review.yml",
      "scripts/pr-risk.mjs",
      "AGENTS.md",
      "apps/api/AGENTS.md",
      ".claude/settings.json",
      "apps/api/.claude/settings.json",
      ".mcp.json",
      "db/migrations/0042_add_column.sql",
      "db/schema.ts",
      "apps/api/src/app.ts",
      "apps/api/src/db/tenants.ts",
      "pnpm-lock.yaml",
      "patches/react-native-screens.patch",
      "vitest.config.ts",
      "playwright.config.ts",
      "eslint.config.mjs",
      "tsconfig.base.json",
      "e2e/fixtures/accessibility.ts",
      "apps/api/src/routes/paypal-webhooks.ts",
      "apps/api/src/routes/billing.ts",
      "apps/api/src/db/platform-admin.ts",
      "apps/api/src/index.ts",
      "apps/api/src/rate-limit.ts",
      "apps/api/src/db/provider-configs.ts",
      "apps/web/src/auth/session.ts",
      "apps/web/public/_headers",
      "apps/site/deployment-config.ts",
      "apps/site/scripts/finalize-build.mjs",
      "apps/site/public/_redirects",
      "apps/site/functions/ingest/[[path]].ts",
      "apps/web/package.json",
      "apps/api/wrangler.deploy.jsonc",
      "apps/api/src/auth.ts",
      "apps/api/src/billing/paypal.ts",
      "apps/api/src/db/mobile-sync/push.ts",
      "packages/shared/src/money.ts",
      "apps/mobile/src/sync/outbox.ts",
      "apps/api/src/composition.ts",
      "apps/api/src/http/rate-limit-policy.ts",
      "apps/api/src/routes/voice-stream.ts",
      "apps/api/src/routes/assistant-voice.ts",
      "apps/api/src/db/voice-tickets.ts",
      "apps/api/src/db/mobile-sync/push/entities/goal.ts",
      "packages/shared/src/limits.ts",
      "packages/shared/src/schemas/ledger.ts",
      "packages/shared/src/schemas/index.ts",
      "apps/web/src/lib/api/transport.ts",
      "apps/mobile/src/features/auth/SignInScreen.tsx",
      "apps/mobile/src/db/transaction-mutations/commands/goal.ts",
    ];
    expect(highRiskPaths(risky)).toEqual(risky);
  });

  it("leaves ordinary feature and docs changes eligible", () => {
    expect(
      highRiskPaths([
        "apps/web/src/components/landing/ReceiptPileScroll.tsx",
        "apps/api/src/db/budgets.ts",
        "apps/api/src/routes/budgets.ts",
        "apps/api/tests/budgets.test.ts",
        "e2e/core-flow.spec.ts",
        "packages/shared/src/planning.ts",
        "packages/shared/src/schemasHelpers.ts",
        "apps/web/src/lib/api/goals.ts",
        "apps/web/src/queries/accounts.ts",
        "apps/api/src/routes/dashboard.ts",
        "docs/deployment.md",
        "CHANGELOG.md",
      ]),
    ).toEqual([]);
  });
});
