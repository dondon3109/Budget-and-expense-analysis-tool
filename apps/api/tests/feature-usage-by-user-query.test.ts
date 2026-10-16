import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("feature use per user report", () => {
  const report = readFileSync(
    new URL("../../../docs/queries/feature-usage-by-user.sql", import.meta.url),
    "utf8",
  );

  it("counts logical transactions per entry method and names the user where it can", () => {
    const { database } = createD1TestDatabase();
    databases.push(database);
    database.exec(`
      INSERT INTO tenants (id, kind, name) VALUES ('web-user', 'user', 'A'), ('app-user', 'user', 'B');
      INSERT INTO user_tenants (user_id, tenant_id) VALUES ('u-web', 'web-user'), ('u-app', 'app-user');
      INSERT INTO app_user_identities (user_id, verified_email) VALUES ('u-web', 'web@example.com');
      INSERT INTO categories (id, tenant_id, name, kind, color) VALUES
        ('food', 'web-user', 'Food', 'expense', '#000000'),
        ('move', 'web-user', 'Transfer', 'transfer', '#000000'),
        ('food-b', 'app-user', 'Food', 'expense', '#000000');
      INSERT INTO transactions
        (id, tenant_id, category_id, date, description, amount_minor, kind, transfer_group_id, entry_method, deleted_at)
      VALUES
        ('v1', 'web-user', 'food', '2026-10-01', 'Lunch', -100, 'expense', NULL, 'voice', NULL),
        ('v2', 'web-user', 'food', '2026-10-02', 'Dinner', -100, 'expense', NULL, 'voice', NULL),
        ('gone', 'web-user', 'food', '2026-10-02', 'Removed', -100, 'expense', NULL, 'voice', '2026-10-03'),
        ('out', 'web-user', 'move', '2026-10-02', 'Top-up', -500, 'transfer', 'pair', 'sms', NULL),
        ('in', 'web-user', 'move', '2026-10-02', 'Top-up', 500, 'transfer', 'pair', 'sms', NULL),
        ('old', 'web-user', 'food', '2026-09-01', 'Before 0074', -100, 'expense', NULL, NULL, NULL),
        ('w1', 'app-user', 'food-b', '2026-10-02', 'Coffee', -100, 'expense', NULL, 'widget', NULL);
    `);

    const rows = database.prepare(report).all();

    expect(rows).toEqual([
      expect.objectContaining({
        email: "web@example.com",
        user_id: "u-web",
        total: 3,
        voice: 2,
        sms: 1,
        widget: 0,
      }),
      expect.objectContaining({ email: null, user_id: "u-app", total: 1, widget: 1, voice: 0 }),
    ]);
  });
});
