#!/usr/bin/env node
/**
 * Switches the web app and API between the cloud Supabase project they normally
 * point at and a Supabase stack running locally in Docker.
 *
 *   node scripts/local-supabase.mjs status    # what is configured right now (default)
 *   node scripts/local-supabase.mjs enable    # point both apps at http://127.0.0.1:54321
 *   node scripts/local-supabase.mjs disable   # restore the cloud values
 *
 * enable() backs up the current values first and refuses to run twice, so the
 * cloud configuration can always be restored with disable(). Both target files are
 * gitignored (.dev.vars and .env.*), and the backups written here are ignored too.
 *
 * Why local Supabase rather than the API's dummy dev token: the token path maps
 * every request to a single hard-coded DEV_USER_ID with no real session, so it
 * proves nothing about session handling. Local Supabase exercises the real JWT,
 * refresh and tenant-resolution path with no application code changes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const TARGETS = [
  {
    label: "api",
    file: `${ROOT}/apps/api/.dev.vars`,
    backup: `${ROOT}/apps/api/.dev.vars.zoption-cloud-backup`,
    keys: { SUPABASE_URL: "url" },
  },
  {
    label: "web",
    file: `${ROOT}/apps/web/.env.local`,
    backup: `${ROOT}/apps/web/.env.local.zoption-cloud-backup`,
    keys: { VITE_SUPABASE_URL: "url", VITE_SUPABASE_PUBLISHABLE_KEY: "key" },
  },
];

const LOCAL_URL = "http://127.0.0.1:54321";

function readEnv(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

/** Replace key=... in place, or append it when the file does not define it yet. */
function upsertEnv(content, key, value) {
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, `${key}=${value}`);
  const trimmed = content.endsWith("\n") || content === "" ? content : `${content}\n`;
  return `${trimmed}${key}=${value}\n`;
}

function currentValue(content, key) {
  const match = content?.match(new RegExp(`^\\s*${key}\\s*=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

function mask(value) {
  if (!value) return "(unset)";
  if (value.length <= 18) return value;
  return `${value.slice(0, 14)}…${value.slice(-4)}`;
}

function detectRuntime() {
  const has = (command, args = ["--version"]) => {
    try {
      execFileSync(command, args, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  return { supabase: has("supabase") || has("npx", ["--no-install", "supabase", "--version"]), docker: has("docker", ["info"]) };
}

/** Reads the running local stack so we never hardcode keys that the CLI owns. */
function readLocalStack() {
  const attempts = [
    ["supabase", ["status", "-o", "json"]],
    ["npx", ["--no-install", "supabase", "status", "-o", "json"]],
  ];
  for (const [command, args] of attempts) {
    try {
      const out = execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const parsed = JSON.parse(out.slice(out.indexOf("{")));
      const url = parsed.API_URL ?? parsed.api_url;
      const key = parsed.ANON_KEY ?? parsed.PUBLISHABLE_KEY ?? parsed.anon_key;
      if (url && key) return { url: url.replace(/\/$/, ""), key };
    } catch {
      // Try the next form; the caller reports a single clear failure.
    }
  }
  return null;
}

function status() {
  const runtime = detectRuntime();
  console.log("Local Supabase switch — status\n");
  for (const target of TARGETS) {
    const content = readEnv(target.file);
    console.log(`  ${target.label.padEnd(4)} ${target.file.replace(`${ROOT}/`, "")}`);
    if (content === null) {
      console.log("       file missing");
    } else {
      for (const [key, kind] of Object.entries(target.keys)) {
        const value = currentValue(content, key);
        console.log(`       ${key.padEnd(30)} ${kind === "key" ? mask(value) : (value ?? "(unset)")}`);
      }
    }
    console.log(`       backup: ${existsSync(target.backup) ? "present (local mode is active)" : "none"}`);
  }
  console.log(`\n  supabase CLI: ${runtime.supabase ? "available" : "NOT AVAILABLE"}`);
  console.log(`  docker:       ${runtime.docker ? "running" : "NOT RUNNING"}`);
  if (!runtime.docker) {
    console.log("\n  A container runtime is required before 'enable' can work: supabase start needs Docker.");
  }
}

function enable(force) {
  const alreadyBackedUp = TARGETS.filter((target) => existsSync(target.backup));
  if (alreadyBackedUp.length > 0 && !force) {
    console.error("Refusing to run: a cloud backup already exists, so local mode may already be active.");
    console.error("Run 'disable' first to restore the cloud values, or pass --force to overwrite the backup.");
    process.exit(1);
  }

  const stack = readLocalStack();
  if (!stack) {
    console.error("Could not read a running local Supabase stack.");
    console.error("Start one first:   supabase start");
    console.error("If the CLI or Docker is missing, see docs/local-supabase.md.");
    process.exit(1);
  }
  if (!stack.url.includes("127.0.0.1") && !stack.url.includes("localhost")) {
    console.error(`Refusing to write a non-loopback URL: ${stack.url}`);
    process.exit(1);
  }

  for (const target of TARGETS) {
    const content = readEnv(target.file);
    if (content === null) {
      console.error(`${target.file} is missing; cannot switch it.`);
      process.exit(1);
    }
    writeFileSync(target.backup, content, { mode: 0o600 });
    let next = content;
    for (const [key, kind] of Object.entries(target.keys)) {
      next = upsertEnv(next, key, kind === "url" ? stack.url : stack.key);
    }
    writeFileSync(target.file, next, { mode: 0o600 });
    console.log(`  ${target.label}: now pointing at ${stack.url}`);
  }

  console.log("\nLocal Supabase enabled. Restart both dev servers to pick it up.");
  console.log("Then seed a workspace for a user you create in the local stack:");
  console.log("  node scripts/seed-local-workspace.mjs --user <uuid>");
  console.log("Restore the cloud config with: node scripts/local-supabase.mjs disable");
}

function disable() {
  let restored = 0;
  for (const target of TARGETS) {
    if (!existsSync(target.backup)) {
      console.log(`  ${target.label}: no backup, left untouched`);
      continue;
    }
    writeFileSync(target.file, readFileSync(target.backup, "utf8"), { mode: 0o600 });
    rmSync(target.backup, { force: true });
    console.log(`  ${target.label}: restored from backup`);
    restored += 1;
  }
  console.log(restored > 0 ? "\nCloud configuration restored. Restart both dev servers." : "\nNothing to restore.");
}

const [command = "status", ...rest] = process.argv.slice(2);
if (command === "status") status();
else if (command === "enable") enable(rest.includes("--force"));
else if (command === "disable") disable();
else {
  console.error(`Unknown command "${command}". Use status, enable or disable.`);
  process.exit(1);
}
