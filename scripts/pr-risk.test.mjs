import { describe, expect, it } from "vitest";

import { highRiskPaths } from "./pr-risk.mjs";

describe("highRiskPaths", () => {
  it("flags the automation, money, auth, billing, and schema paths", () => {
    const risky = [
      ".github/workflows/pr-review.yml",
      "scripts/pr-risk.mjs",
      "AGENTS.md",
      "apps/api/AGENTS.md",
      "db/migrations/0042_add_column.sql",
      "pnpm-lock.yaml",
      "apps/web/package.json",
      "apps/api/wrangler.deploy.jsonc",
      "apps/api/src/auth.ts",
      "apps/api/src/billing/paypal.ts",
      "apps/api/src/db/mobile-sync/push.ts",
      "packages/shared/src/money.ts",
      "apps/mobile/src/sync/outbox.ts",
    ];
    expect(highRiskPaths(risky)).toEqual(risky);
  });

  it("leaves ordinary feature and docs changes eligible", () => {
    expect(
      highRiskPaths([
        "apps/web/src/components/landing/ReceiptPileScroll.tsx",
        "apps/api/src/db/budgets.ts",
        "packages/shared/src/planning.ts",
        "docs/deployment.md",
        "CHANGELOG.md",
      ]),
    ).toEqual([]);
  });
});
