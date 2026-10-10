#!/usr/bin/env node
/**
 * One-off: copies the profile pictures still in the private Supabase `avatars` bucket into
 * the Worker's R2 bucket under the key the Worker reads (`avatars/<userId>/<file>`), so the
 * Worker can stop falling back to Supabase Storage. Dry run unless --apply is passed.
 *
 *   export SUPABASE_URL=https://PROJECT_REF.supabase.co SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/copy-supabase-avatars-to-r2.mjs --r2-bucket zoption-avatars-production
 *   node scripts/copy-supabase-avatars-to-r2.mjs --r2-bucket zoption-avatars-production --apply
 *   node scripts/copy-supabase-avatars-to-r2.mjs --r2-bucket zoption-avatars-production --apply --delete-source
 *
 * --apply uploads each picture with Wrangler (run `wrangler login` first), reads it back
 * from R2 and compares bytes. --delete-source then removes only the verified source objects.
 * Re-running is safe: an upload overwrites the same key with the same bytes.
 */
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const SOURCE_BUCKET = "avatars";
const PAGE_SIZE = 100;

// Mirrors parseAvatarPath in apps/api/src/avatars.ts: the Worker serves nothing else.
export function isServableAvatarPath(path) {
  return /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(path);
}

export function r2KeyFor(path) {
  return `avatars/${path}`;
}

// Storage lists one folder level at a time; entries with a null id are folders.
export async function listSourcePaths(fetcher, baseUrl, serviceRoleKey, prefix = "") {
  const paths = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetcher(`${baseUrl}/storage/v1/object/list/${SOURCE_BUCKET}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix, limit: PAGE_SIZE, offset }),
    });
    if (!response.ok) throw new Error(`Listing ${prefix || "/"} returned ${response.status}.`);
    const entries = await response.json();
    for (const entry of entries) {
      if (entry.id === null) {
        paths.push(
          ...(await listSourcePaths(fetcher, baseUrl, serviceRoleKey, `${prefix}${entry.name}/`)),
        );
      } else {
        paths.push(`${prefix}${entry.name}`);
      }
    }
    if (entries.length < PAGE_SIZE) return paths;
  }
}

function wrangler(args, options = {}) {
  return execFileSync("pnpm", ["--filter", "@zoption/api", "exec", "wrangler", ...args], {
    stdio: ["ignore", options.capture ? "pipe" : "ignore", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      "r2-bucket": { type: "string" },
      apply: { type: "boolean", default: false },
      "delete-source": { type: "boolean", default: false },
    },
  });
  const r2Bucket = values["r2-bucket"];
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!r2Bucket) throw new Error("Pass --r2-bucket (zoption-avatars-preview or -production).");
  if (!baseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the matching project.");
  }
  if (values["delete-source"] && !values.apply) throw new Error("--delete-source needs --apply.");

  const paths = await listSourcePaths(fetch, baseUrl, serviceRoleKey);
  const servable = paths.filter(isServableAvatarPath);
  const skipped = paths.filter((path) => !isServableAvatarPath(path));
  console.log(
    `${paths.length} source objects, ${servable.length} servable, ${skipped.length} skipped.`,
  );
  for (const path of skipped) console.log(`  skip (never served by the Worker): ${path}`);
  if (!values.apply) {
    for (const path of servable)
      console.log(`  would copy ${path} -> ${r2Bucket}/${r2KeyFor(path)}`);
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "zoption-avatars-"));
  const verified = [];
  try {
    for (const path of servable) {
      const source = await fetch(
        `${baseUrl}/storage/v1/object/authenticated/${SOURCE_BUCKET}/${path}`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (!source.ok) throw new Error(`Downloading ${path} returned ${source.status}.`);
      const bytes = Buffer.from(await source.arrayBuffer());
      const contentType = source.headers.get("Content-Type") ?? "application/octet-stream";
      const file = join(workDir, path.replaceAll("/", "_"));
      writeFileSync(file, bytes);

      const target = `${r2Bucket}/${r2KeyFor(path)}`;
      wrangler([
        "r2",
        "object",
        "put",
        target,
        "--file",
        file,
        "--content-type",
        contentType,
        "--remote",
      ]);
      const readBack = wrangler(["r2", "object", "get", target, "--pipe", "--remote"], {
        capture: true,
      });
      if (!bytes.equals(readBack)) throw new Error(`R2 copy of ${path} does not match the source.`);
      verified.push(path);
      console.log(`  copied ${path}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    console.log(`${verified.length} of ${servable.length} copied and verified.`);
  }

  if (!values["delete-source"]) return;
  for (let index = 0; index < verified.length; index += PAGE_SIZE) {
    const response = await fetch(`${baseUrl}/storage/v1/object/${SOURCE_BUCKET}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: verified.slice(index, index + PAGE_SIZE) }),
    });
    if (!response.ok) throw new Error(`Deleting source objects returned ${response.status}.`);
  }
  console.log(`Deleted ${verified.length} verified source objects.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
