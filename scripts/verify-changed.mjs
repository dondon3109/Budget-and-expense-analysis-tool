#!/usr/bin/env node
// Inner-loop verification: runs only the scoped `pnpm verify:<scope>` commands the current change
// needs, judged from the files that differ from the merge base with origin/main (plus uncommitted
// and untracked files). A change to the shared package or to root configuration can affect every
// workspace, so it escalates to the full `pnpm verify`, which stays the gate before reporting done.
//
//   pnpm verify:changed            run the plan
//   pnpm verify:changed --dry-run  print the plan without running it

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Paths whose change can break any workspace, so only the full verify proves them.
const FULL_VERIFY = [
  /^packages\/shared\//,
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
  /^tsconfig[^/]*\.json$/,
  /^(eslint\.config\.mjs|vitest\.config\.ts|prettier\.config\.mjs|\.prettierignore)$/,
  /^(playwright\.config\.ts|release\.config\.mjs|drizzle\.config\.ts)$/,
  /^tests\//,
  /^e2e\//,
  /^patches\//,
  // The D1 schema and migrations also feed e2e and drizzle-kit, not only the api tests.
  /^db\//,
];

const SCOPES = [
  { scope: "api", pattern: /^apps\/api\// },
  { scope: "web", pattern: /^apps\/web\// },
  { scope: "mobile", pattern: /^apps\/mobile\// },
  { scope: "scripts", pattern: /^(scripts|\.github)\// },
];

/** Decides which verify commands prove a change to `paths` (repo-relative POSIX paths). */
export function planVerification(paths) {
  if (paths.some((path) => FULL_VERIFY.some((pattern) => pattern.test(path)))) {
    return { full: true, scopes: [] };
  }
  const scopes = SCOPES.filter(({ pattern }) => paths.some((path) => pattern.test(path))).map(
    ({ scope }) => scope,
  );
  return { full: false, scopes };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** The merge base with main, or null when neither origin/main nor main is available. */
function mergeBase(root) {
  for (const ref of ["origin/main", "main"]) {
    try {
      return git(root, ["merge-base", "HEAD", ref]);
    } catch {
      // Try the next ref.
    }
  }
  return null;
}

function changedPaths(root, base) {
  // --no-renames lists both sides of a move, so the workspace a file left is checked too.
  const committedAndStaged = git(root, ["diff", "--name-only", "--no-renames", base]).split("\n");
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  return [...new Set([...committedAndStaged, ...untracked].filter(Boolean))];
}

function run(root, command, args) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");
  const base = mergeBase(root);
  if (!base) {
    console.log("No merge base with origin/main or main (shallow or detached checkout).");
    if (dryRun) {
      console.log("  pnpm verify");
      process.exit(0);
    }
    run(root, "pnpm", ["verify"]);
    process.exit(0);
  }
  const paths = changedPaths(root, base);
  const plan = planVerification(paths);

  const steps = plan.full
    ? [["pnpm", ["verify"]]]
    : [
        ["node", ["scripts/verify-workspace-links.mjs"]],
        ["node", ["scripts/check-structure.mjs"]],
        ...plan.scopes.map((scope) => ["pnpm", [`verify:${scope}`]]),
      ];
  // Files outside every scope, such as docs, still need to be formatted. Deleted files are skipped.
  const present = paths.filter((path) => existsSync(resolve(root, path)));
  if (!plan.full && present.length > 0) {
    steps.push(["pnpm", ["exec", "prettier", "--check", "--ignore-unknown", ...present]]);
  }

  console.log(`${paths.length} changed file(s) since the merge base with origin/main.`);
  console.log(
    plan.full
      ? "Shared or root configuration changed: running the full verify."
      : `Scopes: ${plan.scopes.join(", ") || "none"}.`,
  );
  if (dryRun) {
    for (const [command, args] of steps) console.log(`  ${[command, ...args].join(" ")}`);
    process.exit(0);
  }
  for (const [command, args] of steps) run(root, command, args);
}
