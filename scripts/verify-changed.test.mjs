import { describe, expect, it } from "vitest";

import { planVerification } from "./verify-changed.mjs";

describe("planVerification", () => {
  it("runs one scoped verify per touched workspace", () => {
    expect(
      planVerification([
        "apps/api/src/routes/goals.ts",
        "apps/mobile/src/features/goals/GoalsScreen.tsx",
      ]),
    ).toEqual({ full: false, scopes: ["api", "mobile"] });
    expect(planVerification(["apps/web/src/pages/BudgetsPage.tsx"])).toEqual({
      full: false,
      scopes: ["web"],
    });
    expect(planVerification([".github/workflows/ci.yml"])).toEqual({
      full: false,
      scopes: ["scripts"],
    });
  });

  it("escalates shared and root configuration changes to the full verify", () => {
    for (const path of [
      "packages/shared/src/money.ts",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.base.json",
      "eslint.config.mjs",
      "vitest.config.ts",
      "tests/vitest.setup.ts",
      "e2e/core-flow.spec.ts",
      "db/migrations/0066_example.sql",
      "db/schema.ts",
    ]) {
      expect(planVerification(["apps/web/src/App.tsx", path])).toEqual({ full: true, scopes: [] });
    }
  });

  it("needs no workspace scope for docs alone", () => {
    expect(planVerification(["docs/deployment.md", "AGENTS.md"])).toEqual({
      full: false,
      scopes: [],
    });
  });
});
