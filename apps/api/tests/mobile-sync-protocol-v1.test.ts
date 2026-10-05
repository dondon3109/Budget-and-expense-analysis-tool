import { mobileSyncFeatures } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository } from "../src/db/mobile-sync";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

const clientId = "50000000-0000-4000-8000-000000000001";

// Clients that send no sync features (0.2.43 and 0.2.44) only hold what protocol version 1 shipped.
describe("mobile sync for protocol version 1 clients", () => {
  function environment() {
    const created = createSyncEnvironment();
    created.database.exec(`
      INSERT INTO accounts (id, tenant_id, name, type, currency) VALUES
        ('account-eur', 'tenant-1', 'Euro card', 'checking', 'EUR');
      INSERT INTO transactions (
        id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind
      ) VALUES
        ('transaction-eur', 'tenant-1', 'account-eur', 'category-1', '2026-08-16', 'Paris lunch', -2500, 'EUR', 'expense');
      INSERT INTO subscriptions (
        id, tenant_id, account_id, category_id, name, amount_minor, billing_cycle, next_billing_date, status
      ) VALUES
        ('subscription-eur', 'tenant-1', 'account-eur', 'category-1', 'Euro paper', 900, 'monthly', '2026-09-01', 'active');
    `);
    return created;
  }

  async function snapshot(features: ReadonlySet<(typeof mobileSyncFeatures)[number]>) {
    const { env } = environment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const response = await repository.snapshot(
      env,
      "tenant-1",
      { protocolVersion: 1, clientId, snapshotCursor: null, offset: 0, limit: 200 },
      features,
    );
    return response.changes;
  }

  it("leaves out rows in, or belonging to, accounts in other currencies", async () => {
    const changes = await snapshot(new Set());
    const ids = changes.map((change) => change.entityId);

    expect(ids).toContain("account-1");
    expect(ids).not.toContain("account-eur");
    expect(ids).not.toContain("transaction-eur");
    expect(ids).not.toContain("subscription-eur");
  });

  it("sends categories without their system key", async () => {
    const changes = await snapshot(new Set());
    const categories = changes.filter((change) => change.entityType === "category");

    expect(categories.some((change) => change.payload && "systemKey" in change.payload)).toBe(
      false,
    );
  });

  it("sends everything to clients announcing the current features", async () => {
    const changes = await snapshot(new Set(mobileSyncFeatures));
    const ids = changes.map((change) => change.entityId);

    expect(ids).toEqual(
      expect.arrayContaining(["account-eur", "transaction-eur", "subscription-eur"]),
    );
    expect(
      changes.find((change) => change.entityId === "tenant-1:category:debt-payment")?.payload,
    ).toMatchObject({ systemKey: "debt:expense" });
  });
});
