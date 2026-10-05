import { readdirSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import {
  mobileSyncAcknowledgeRequestSchema,
  mobileSyncPullRequestSchema,
  mobileSyncPushRequestSchema,
  mobileSyncSnapshotRequestSchema,
  parseMobileSyncFeatures,
} from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMobileSyncRepository } from "../src/db/mobile-sync";
import { createMobileSyncTestEnvironment } from "./helpers/mobile-sync-test-environment";

// Every installed app validates sync responses strictly against the schemas it was built with.
// scripts/freeze-mobile-sync-contract.mjs records those schemas per release; this replays the
// current sync engine against each one, so a change that would break an installed app fails here.
// The directory holds every release still supported; retiring one means deleting its contract.
const contractDirectory = new URL(
  "../../../packages/shared/contracts/mobile-sync/",
  import.meta.url,
);
const contracts = readdirSync(contractDirectory)
  .filter((name) => name.endsWith(".json"))
  .map(
    (name) =>
      JSON.parse(readFileSync(new URL(name, contractDirectory), "utf8")) as {
        versionName: string;
        features: string[];
        samplePushRequest: unknown;
        responses: Record<
          "pull" | "snapshot" | "push" | "acknowledge",
          z.core.JSONSchema.JSONSchema
        >;
      },
  );

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** The shared fixtures plus rows that reach every feature-gated field. */
function environment() {
  const created = createMobileSyncTestEnvironment();
  databases.push(created.database);
  created.database.exec(`
    INSERT INTO accounts (id, tenant_id, name, type, currency) VALUES
      ('account-3', 'tenant-1', 'Brokerage', 'investment', 'PHP'),
      ('account-4', 'tenant-1', 'Euro card', 'checking', 'EUR');
    INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, debt_id
    ) VALUES
      ('transaction-3', 'tenant-1', 'account-1', 'category-1', '2026-08-15', 'Car payment', -12000, 'PHP', 'expense', 'debt-1'),
      ('transaction-4', 'tenant-1', 'account-4', 'category-1', '2026-08-16', 'Paris lunch', -2500, 'EUR', 'expense', NULL);
  `);
  return created;
}

function expectAccepted(schema: z.core.JSONSchema.JSONSchema, response: unknown) {
  const result = z.fromJSONSchema(schema).safeParse(response);
  expect(result.success ? [] : result.error.issues).toEqual([]);
}

describe("released app contracts", () => {
  it("include the version the mobile app builds now", () => {
    const { version } = JSON.parse(
      readFileSync(new URL("../../mobile/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(contracts.map((contract) => contract.versionName)).toContain(version);
  });

  // The sync floor and the oldest contract are the same decision: retiring a release deletes its
  // contract and raises MOBILE_SYNC_MINIMUM_APP_VERSION together.
  it("start at the minimum app version every deployed Worker enforces", () => {
    const config = readFileSync(new URL("../wrangler.deploy.jsonc", import.meta.url), "utf8");
    const floors = [...config.matchAll(/"MOBILE_SYNC_MINIMUM_APP_VERSION": "([^"]+)"/g)].map(
      (match) => match[1],
    );
    const oldest = contracts
      .map((contract) => contract.versionName.replace(/-.*$/, ""))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[0];
    expect(floors).toEqual([oldest, oldest]);
  });
});

describe.each(contracts)("released app $versionName", (contract) => {
  const features = parseMobileSyncFeatures(contract.features.join(","));
  const clientId = "c0000000-0000-4000-8000-000000000001";

  it("accepts a full snapshot and an incremental pull", async () => {
    const { env } = environment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));

    const snapshot = await repository.snapshot(
      env,
      "tenant-1",
      mobileSyncSnapshotRequestSchema.parse({ protocolVersion: 1, clientId, limit: 200 }),
      features,
    );
    expect(snapshot.changes.length).toBeGreaterThan(0);
    expectAccepted(contract.responses.snapshot, snapshot);

    const pull = await repository.pull(
      env,
      "tenant-1",
      mobileSyncPullRequestSchema.parse({ protocolVersion: 1, cursor: null, limit: 200 }),
      features,
    );
    expectAccepted(contract.responses.pull, pull);
  });

  it("accepts the push it sends and the acknowledgement after it", async () => {
    const { env } = environment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));

    const push = await repository.push(
      env,
      "tenant-1",
      mobileSyncPushRequestSchema.parse(contract.samplePushRequest),
      features,
    );
    expect(push.results.map((result) => result.status)).toEqual(["acknowledged"]);
    expectAccepted(contract.responses.push, push);

    const pull = await repository.pull(
      env,
      "tenant-1",
      mobileSyncPullRequestSchema.parse({ protocolVersion: 1, cursor: null, limit: 200 }),
      features,
    );
    const acknowledge = await repository.acknowledge(
      env,
      "tenant-1",
      mobileSyncAcknowledgeRequestSchema.parse({
        protocolVersion: 1,
        clientId,
        cursor: pull.nextCursor,
      }),
    );
    expectAccepted(contract.responses.acknowledge, acknowledge);
  });
});
