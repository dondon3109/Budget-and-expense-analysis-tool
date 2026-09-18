#!/usr/bin/env node
// First step of `pnpm verify`: prove pnpm's @zoption/* workspace links exist before any
// typecheck or test runs, because their absence surfaces as "Cannot find package
// '@zoption/shared'" inside unrelated code and reads like a source bug.

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_PARENTS = ["apps", "packages"];
// pnpm-workspace.yaml excludes apps/stt-bridge from the workspace.
const EXCLUDED_PROJECTS = new Set([join(REPO_ROOT, "apps", "stt-bridge")]);
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const readManifest = (projectDir) =>
  JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));

const projectDirs = [REPO_ROOT];
for (const parent of PROJECT_PARENTS) {
  for (const entry of readdirSync(join(REPO_ROOT, parent), { withFileTypes: true })) {
    const projectDir = join(REPO_ROOT, parent, entry.name);
    if (!entry.isDirectory() || EXCLUDED_PROJECTS.has(projectDir)) continue;
    if (existsSync(join(projectDir, "package.json"))) projectDirs.push(projectDir);
  }
}

const projectsByName = new Map(
  projectDirs.map((projectDir) => [readManifest(projectDir).name, projectDir]),
);

/** Every @zoption/* link pnpm creates, and the workspace directory it must point at. */
function expectedLinks() {
  const links = [];
  for (const projectDir of projectDirs) {
    const manifest = readManifest(projectDir);
    const declared = new Set(
      DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})),
    );
    for (const name of declared) {
      if (!name.startsWith("@zoption/")) continue;
      links.push({
        link: join(projectDir, "node_modules", ...name.split("/")),
        target: projectsByName.get(name) ?? null,
      });
    }
  }
  // pnpm also hoists the workspace packages into the virtual store for resolution from inside
  // dependencies (hoistWorkspacePackages and hoistPattern "*" in pnpm-workspace.yaml).
  const hoistRoot = join(REPO_ROOT, "node_modules", ".pnpm", "node_modules");
  if (existsSync(hoistRoot)) {
    for (const [name, projectDir] of projectsByName) {
      if (!name.startsWith("@zoption/")) continue;
      links.push({ link: join(hoistRoot, ...name.split("/")), target: projectDir });
    }
  }
  return links;
}

/** null when the link is healthy, otherwise a short description of what is wrong with it. */
function linkProblem(link, target) {
  let stats;
  try {
    stats = lstatSync(link);
  } catch {
    return "missing";
  }
  if (!stats.isSymbolicLink()) return "present but not a symlink";
  let realLink;
  try {
    realLink = realpathSync(link);
  } catch {
    return "symlink whose target does not exist";
  }
  if (target && realLink !== realpathSync(target)) {
    return `points at ${relative(REPO_ROOT, realLink)}, expected ${relative(REPO_ROOT, target)}`;
  }
  return null;
}

const rootModulesMissing = !existsSync(join(REPO_ROOT, "node_modules", ".modules.yaml"));
const problems = [];
if (rootModulesMissing) {
  problems.push("node_modules: missing or not installed by pnpm");
} else {
  const links = expectedLinks();
  for (const { link, target } of links) {
    const problem = linkProblem(link, target);
    if (problem) problems.push(`${relative(REPO_ROOT, link)}: ${problem}`);
  }
}

if (problems.length > 0) {
  const repair = rootModulesMissing
    ? "pnpm install --frozen-lockfile"
    : "rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install --frozen-lockfile";
  console.error(
    "verify: broken pnpm workspace links. This is a node_modules state problem, not a source bug.\n",
  );
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`
pnpm install --frozen-lockfile does NOT repair this on its own: pnpm trusts the link record in
node_modules/.modules.yaml, so after node_modules is deleted or reinstalled by hand it reports
"Already up to date" and leaves the @zoption/* links missing. Imports then fail with
"Cannot find package '@zoption/shared'".

Repair it with a clean relink (this script does not run it):
    ${repair}

Then run \`pnpm verify\` again.`);
  process.exit(1);
}

console.log(
  `verify: workspace links OK (${expectedLinks().length} @zoption links across ${projectDirs.length} workspace projects)`,
);
