import { describe, expect, it } from "vitest";

import { atomicMobileSyncPage } from "../apps/api/src/db/mobile-sync/protocol.ts";
import { createD1TestDatabase } from "../apps/api/tests/helpers/d1-test-harness.ts";

import { buildResetSql, buildSql } from "./seed-local-workspace.mjs";

const userId = "11111111-2222-3333-4444-555555555555";
const tenantId = `user:${userId}`;

function syncLog(database) {
  return database
    .prepare(
      `SELECT c.sequence, c.entity_type AS entityType, c.entity_id AS entityId,
              c.row_revision AS rowRevision, c.operation, c.payload_json AS payloadJson,
              c.server_updated_at AS serverUpdatedAt, g.atomic_group_id AS atomicGroupId
       FROM mobile_sync_changes c
       LEFT JOIN mobile_sync_change_groups g USING (tenant_id, sequence)
       WHERE c.tenant_id = ?
       ORDER BY c.sequence`,
    )
    .all(tenantId);
}

function expectPullable(database) {
  const rows = syncLog(database);
  expect(atomicMobileSyncPage(rows, rows.length + 1)).toHaveLength(rows.length);
}

describe("seed-local-workspace", () => {
  it("keeps every subscription sync group pullable across seed, reseed and reset", () => {
    const { database } = createD1TestDatabase();

    database.exec(buildSql(userId, 3));
    expectPullable(database);
    const groups = database
      .prepare(
        `SELECT atomic_group_id AS id, count(*) AS size FROM mobile_sync_change_groups
         WHERE tenant_id = ? GROUP BY atomic_group_id`,
      )
      .all(tenantId);
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.size === 2)).toBe(true);

    const changesAfterSeed = syncLog(database).length;
    database.exec(buildSql(userId, 3));
    expect(syncLog(database)).toHaveLength(changesAfterSeed);

    database.exec(buildResetSql(userId));
    expectPullable(database);
    expect(
      database.prepare("SELECT count(*) AS n FROM subscriptions WHERE tenant_id = ?").get(tenantId)
        .n,
    ).toBe(0);
  });

  it("never adds a charge to a subscription that already exists", () => {
    const { database } = createD1TestDatabase();
    database.exec(buildSql(userId, 3));
    // A workspace seeded before subscriptions carried a charge, or one whose charge was
    // removed in the app.
    database.exec(`DELETE FROM transactions WHERE subscription_id IS NOT NULL`);
    const changesBefore = syncLog(database).length;

    database.exec(buildSql(userId, 3));

    expect(syncLog(database)).toHaveLength(changesBefore);
  });

  it("stores income positive and expenses and the outgoing transfer negative", () => {
    const { database } = createD1TestDatabase();
    database.exec(buildSql(userId, 3));

    const byKind = database
      .prepare(
        `SELECT kind, min(amount_minor) AS lo, max(amount_minor) AS hi FROM transactions
         WHERE tenant_id = ? GROUP BY kind`,
      )
      .all(tenantId);
    const range = Object.fromEntries(byKind.map((row) => [row.kind, row]));
    expect(range.income.lo).toBeGreaterThan(0);
    expect(range.expense.hi).toBeLessThan(0);
    expect(range.transfer.hi).toBeLessThan(0);
    expect(
      database
        .prepare(
          "SELECT amount_minor AS amount FROM transactions WHERE tenant_id = ? AND description = 'Meralco'",
        )
        .get(tenantId).amount,
    ).toBe(-284075);
  });
});
