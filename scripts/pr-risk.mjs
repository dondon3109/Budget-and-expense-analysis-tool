// Decides which changed paths keep a pull request away from auto-merge. This runs in the PR
// Review report job from the base branch checkout, so a pull request cannot loosen the list it is
// judged by. It is a path check on purpose: the model's verdict never decides risk on its own.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HIGH_RISK = [
  // The automation, its scripts, and the rules the reviewer reads.
  /^\.github\//,
  /^scripts\//,
  /(^|\/)(AGENTS|CLAUDE)\.md$/,
  /(^|\/)\.claude\//,
  /(^|\/)(\.mcp\.json|CLAUDE\.local\.md)$/,
  // Schema, dependencies, and release configuration.
  /^db\//,
  /^supabase\//,
  /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.gitattributes)$/,
  /^patches\//,
  /^release\.config\.mjs$/,
  /(^|\/)wrangler[^/]*\.jsonc?$/,
  // The configuration behind the required checks, which could otherwise pass without testing.
  /(^|\/)(vitest|playwright|jest|drizzle)\.config\.[cm]?[jt]s$/,
  /(^|\/)eslint\.config\.mjs$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^e2e\/fixtures\//,
  // Auth, tenancy, money, billing, credentials, and sync.
  /^apps\/api\/src\/(app|index|auth|request|rate-limit|rate-limit-do|platform-admin|account-deletion)\.ts$/,
  /^apps\/api\/src\/(billing|provider-credentials|entry)\//,
  /^apps\/api\/src\/db\/(billing|provider-credentials|mobile-sync|tenants|platform-admin|account-deletion|provider-configs)/,
  /^apps\/api\/src\/routes\/(billing|paypal-webhooks|dodo-webhooks|provider-credentials|admin-provider-configs|platform-admin|account-deletion|ops-bug-report-egress|mobile-sync)\.ts$/,
  /^packages\/shared\/src\/(money|sync|schemas)\.ts$/,
  /^apps\/mobile\/src\/(auth|db|sync)\//,
  /^apps\/web\/src\/auth\//,
  /^apps\/web\/public\/_headers$/,
];

export function highRiskPaths(paths) {
  return paths.filter((path) => HIGH_RISK.some((pattern) => pattern.test(path)));
}

// Reads newline-separated paths from a file and prints the high-risk ones, one per line.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const paths = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
  for (const path of highRiskPaths(paths)) console.log(path);
}
