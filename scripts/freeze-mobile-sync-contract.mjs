// Freezes the sync contract a released mobile app holds: the feature names it sends and JSON
// Schemas of the strict responses it accepts, plus one push request it sends. The API test
// apps/api/tests/mobile-sync-released-contracts.test.ts replays every frozen contract against the
// current sync engine, so a change that would break an installed app fails CI.
//
// Run it when publishing a mobile release, from the commit that release was built from (or pass
// that commit as the ref when freezing an older release afterwards):
//
//   node scripts/freeze-mobile-sync-contract.mjs <versionName> [git-ref]
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const sharedDirectory = join(root, "packages/shared");
const contractDirectory = join(sharedDirectory, "contracts/mobile-sync");

// The push the app sends most: one new expense. Built here and checked against the frozen
// request schema, so it is a request that release really could send.
export const samplePushRequest = {
  protocolVersion: 1,
  clientId: "c0000000-0000-4000-8000-000000000001",
  operations: [
    {
      operationId: "c0000000-0000-4000-8000-000000000002",
      idempotencyKey: "c0000000-0000-4000-8000-000000000003",
      entityType: "transaction",
      entityId: "c0000000-0000-4000-8000-000000000004",
      operationType: "create",
      baseRevision: 0,
      dependencyIds: [],
      payload: {
        kind: "expense",
        date: "2026-08-22",
        description: "Contract lunch",
        amountMinor: 2500,
        currency: "PHP",
        categoryId: "category-1",
        accountId: "account-1",
      },
    },
  ],
};

// Node strips the TypeScript types itself; the shared source only needs its extensionless
// relative imports ("./types", "./schemas") resolved to a .ts file, and an old checkout outside the
// workspace needs "zod" resolved from packages/shared.
const sharedPackageUrl = pathToFileURL(join(sharedDirectory, "package.json")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "zod")
      return nextResolve(specifier, { ...context, parentURL: sharedPackageUrl });
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      for (const suffix of [".ts", "/index.ts"]) {
        const candidate = fileURLToPath(new URL(`${specifier}${suffix}`, context.parentURL));
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

/** Loads packages/shared/src/sync.ts as it was at `ref`, or as it is now without one. */
async function loadSync(ref) {
  if (!ref) return import(pathToFileURL(join(sharedDirectory, "src/sync.ts")).href);
  // Node refuses to strip types under node_modules, so the old source goes to a temp directory.
  const checkout = await mkdtemp(join(tmpdir(), "zoption-sync-contract-"));
  const archive = join(checkout, "source.tar");
  await run("git", ["archive", "--output", archive, ref, "packages/shared/src"], { cwd: root });
  await run("tar", ["-xf", archive, "-C", checkout]);
  return import(pathToFileURL(join(checkout, "packages/shared/src/sync.ts")).href);
}

async function main() {
  const [versionName, ref] = process.argv.slice(2);
  if (!/^\d+\.\d+\.\d+(-[a-z]+)?$/.test(versionName ?? "")) {
    throw new Error(
      "Usage: freeze-mobile-sync-contract.mjs <versionName like 0.2.45-beta> [git-ref]",
    );
  }
  const sync = await loadSync(ref);
  const { z } = createRequire(join(sharedDirectory, "package.json"))("zod");
  const schema = (value) => z.toJSONSchema(value, { io: "output", unrepresentable: "any" });

  sync.mobileSyncPushRequestSchema.parse(samplePushRequest);
  const contract = {
    versionName,
    source: ref ?? (await run("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(),
    // Releases before the feature header existed send none.
    features: [...(sync.mobileSyncFeatures ?? [])],
    samplePushRequest,
    responses: {
      pull: schema(sync.mobileSyncPullResponseSchema),
      snapshot: schema(sync.mobileSyncSnapshotResponseSchema),
      push: schema(sync.mobileSyncPushResponseSchema),
      acknowledge: schema(sync.mobileSyncAcknowledgeResponseSchema),
    },
  };
  await mkdir(contractDirectory, { recursive: true });
  const path = join(contractDirectory, `${versionName}.json`);
  await writeFile(path, `${JSON.stringify(contract, null, 2)}\n`);
  await run(join(root, "node_modules/.bin/prettier"), ["--write", path]);
  console.log(`Froze the ${versionName} sync contract from ${contract.source} at ${path}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
