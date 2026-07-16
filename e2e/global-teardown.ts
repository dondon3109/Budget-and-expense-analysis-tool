import { execFileSync } from "node:child_process";

export default function globalTeardown() {
  const pnpmCli = process.env.npm_execpath;
  const sql = [
    "DELETE FROM transactions WHERE tenant_id = 'demo' AND description LIKE 'E2E %'",
    "DELETE FROM imports WHERE tenant_id = 'demo' AND original_filename = 'e2e-import.csv'",
    "DELETE FROM import_previews WHERE tenant_id = 'demo' AND original_filename = 'e2e-import.csv'",
    "UPDATE budgets SET limit_minor = 850000, updated_at = datetime('now') WHERE tenant_id = 'demo' AND category_id = 'food' AND month = '2026-07-01'",
  ].join("; ");
  const args = [
    "--filter",
    "@budget/api",
    "exec",
    "wrangler",
    "d1",
    "execute",
    "budget-expense-local",
    "--local",
    `--command=${sql}`,
  ];
  execFileSync(pnpmCli ? process.execPath : "pnpm", pnpmCli ? [pnpmCli, ...args] : args, {
    stdio: "inherit",
  });
}
