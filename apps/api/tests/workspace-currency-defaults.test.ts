import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { accountRepository } from "../src/db/accounts";
import { createMobileSyncRepository } from "../src/db/mobile-sync";
import { subscriptionRepository } from "../src/db/subscriptions";
import type { Bindings } from "../src/types";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
  grantMobileSyncTestPro,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

const clientId = "60000000-0000-4000-8000-000000000001";

/** tenant-1 switched to USD, with a free expense category subscriptions can use. */
function usdWorkspace(): { env: Bindings; database: DatabaseSync } {
  const environment = createSyncEnvironment();
  environment.database.exec(`
    UPDATE tenants SET currency = 'USD' WHERE id = 'tenant-1';
    INSERT INTO categories (id, tenant_id, name, kind, color, required_plan)
      VALUES ('category-sub', 'tenant-1', 'Streaming', 'expense', '#333333', 'free');
  `);
  return environment;
}

function operation<const Fields extends object>(index: number, fields: Fields) {
  const id = (n: number) => `60000000-0000-4000-8000-${String(index * 10 + n).padStart(12, "0")}`;
  return {
    operationId: id(1),
    idempotencyKey: id(2),
    baseRevision: 0 as const,
    dependencyIds: [] as string[],
    ...fields,
  };
}

function currencyOf(database: DatabaseSync, table: "accounts" | "subscriptions", id: string) {
  return (
    database.prepare(`SELECT currency FROM ${table} WHERE id = ?`).get(id) as {
      currency: string;
    }
  ).currency;
}

/**
 * The node:sqlite harness folds duplicate column names in drizzle's joined selects, so a
 * returned record's `id` can read as the joined account's. Look the row up by name instead.
 */
function subscriptionId(database: DatabaseSync, name: string): string {
  return (
    database.prepare("SELECT id FROM subscriptions WHERE name = ?").get(name) as { id: string }
  ).id;
}

function chargeCurrency(database: DatabaseSync, subscriptionId: string) {
  return (
    database
      .prepare("SELECT currency FROM transactions WHERE subscription_id = ?")
      .get(subscriptionId) as { currency: string }
  ).currency;
}

describe("new accounts start in the workspace currency", () => {
  it("over REST", async () => {
    const { env } = usdWorkspace();
    const created = await accountRepository.create!(env, "tenant-1", {
      name: "Checking",
      type: "checking",
    });
    expect(created.currency).toBe("USD");
  });

  it("unless the account is created in another currency, over REST and mobile sync", async () => {
    const { env, database } = usdWorkspace();
    const created = await accountRepository.create!(env, "tenant-1", {
      name: "Peso checking",
      type: "checking",
      currency: "PHP",
    });
    expect(created.currency).toBe("PHP");

    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const synced = "60000000-0000-4000-8000-000000000201";
    const result = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        operation(3, {
          entityType: "account",
          entityId: synced,
          operationType: "create",
          payload: { name: "Peso wallet", type: "cash", currency: "PHP" },
        }),
      ],
    });
    expect(result.results[0]).toMatchObject({ status: "acknowledged" });
    expect(currencyOf(database, "accounts", synced)).toBe("PHP");
  });

  it("over mobile sync push, with and without interest settings", async () => {
    const { env, database } = usdWorkspace();
    grantMobileSyncTestPro(database, "tenant-1");
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const plain = "60000000-0000-4000-8000-000000000101";
    const withInterest = "60000000-0000-4000-8000-000000000102";

    const result = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        operation(1, {
          entityType: "account",
          entityId: plain,
          operationType: "create",
          payload: { name: "Dollar wallet", type: "cash" },
        }),
      ],
    });
    const interest = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        operation(2, {
          entityType: "account",
          entityId: withInterest,
          operationType: "create",
          payload: {
            name: "Dollar savings",
            type: "savings",
            interest: {
              enabled: true,
              annualRateBasisPoints: 400,
              frequency: "monthly",
              payDay: 1,
            },
          },
        }),
      ],
    });

    expect(result.results[0]).toMatchObject({ status: "acknowledged" });
    expect(interest.results[0]).toMatchObject({ status: "acknowledged" });
    expect(currencyOf(database, "accounts", plain)).toBe("USD");
    expect(currencyOf(database, "accounts", withInterest)).toBe("USD");
    expect(
      database
        .prepare("SELECT name, annual_rate_basis_points AS rate FROM accounts WHERE id = ?")
        .get(withInterest),
    ).toEqual({ name: "Dollar savings", rate: 400 });
  });
});

describe("subscriptions carry their own currency", () => {
  const input = {
    name: "Streaming",
    amountMinor: 1_500,
    billingCycle: "monthly" as const,
    nextBillingDate: "2026-10-01",
    categoryId: "category-sub",
    accountId: "account-1",
  };

  it("defaults a REST create to the workspace currency and keeps it across edits", async () => {
    const { env, database } = usdWorkspace();

    const created = await subscriptionRepository.create(env, "tenant-1", input);
    const id = subscriptionId(database, input.name);
    expect(created.currency).toBe("USD");
    expect(chargeCurrency(database, id)).toBe("USD");

    const renamed = await subscriptionRepository.update(env, "tenant-1", id, {
      ...input,
      name: "Streaming HD",
    });
    expect(renamed.currency).toBe("USD");

    const pesos = await subscriptionRepository.update(env, "tenant-1", id, {
      ...input,
      currency: "PHP",
    });
    expect(pesos.currency).toBe("PHP");
    expect(chargeCurrency(database, id)).toBe("PHP");
  });

  it("totals only the workspace currency and labels each item with its own", async () => {
    const { env } = usdWorkspace();
    await subscriptionRepository.create(env, "tenant-1", input);
    await subscriptionRepository.create(env, "tenant-1", {
      ...input,
      name: "Local gym",
      amountMinor: 150_000,
      currency: "PHP",
    });

    const summary = await subscriptionRepository.list(env, "tenant-1", "2026-10-01");
    expect(summary).toMatchObject({ currency: "USD", totalMonthlyCostMinor: 1_500 });
    // Plans keep their own currency (the fixture also seeds a peso plan of its own).
    expect(summary.items.map((item) => item.currency).sort()).toEqual(["PHP", "PHP", "USD"]);
  });

  it("checks the renewal against the account's balance in the subscription's currency", async () => {
    const { env, database } = usdWorkspace();
    await subscriptionRepository.create(env, "tenant-1", input);
    const id = subscriptionId(database, input.name);
    // Settle the first charge so only the next cycle is due, then fund the account in pesos only.
    database.exec(`
      UPDATE transactions SET subscription_id = NULL WHERE subscription_id = '${id}';
      DELETE FROM transactions WHERE tenant_id = 'tenant-1' AND description = 'Streaming';
      UPDATE subscriptions SET last_charged_date = '2026-09-01' WHERE id = '${id}';
    `);

    const [due] = await subscriptionRepository.listDueRenewals(env, "2026-10-01", 10);
    // The seeded peso lunch does not count toward a dollar charge.
    expect(due).toMatchObject({ id, balanceMinor: 0 });

    database.exec(`
      INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind)
      VALUES ('usd-pay', 'tenant-1', 'account-1', 'category-sub', '2026-09-30', 'Pay', 10000, 'USD', 'income');
    `);
    const [funded] = await subscriptionRepository.listDueRenewals(env, "2026-10-01", 10);
    expect(funded?.balanceMinor).toBe(10_000);
    expect(await subscriptionRepository.postRenewalCharge(env, funded!, "2026-11-01")).toBe(true);
    expect(
      database
        .prepare(
          "SELECT currency, amount_minor AS amountMinor FROM transactions WHERE description = 'Streaming'",
        )
        .get(),
    ).toEqual({ currency: "USD", amountMinor: -1_500 });
  });

  it("bills a synced create in the workspace currency unless the client names one", async () => {
    const { env, database } = usdWorkspace();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const legacy = "60000000-0000-4000-8000-000000000201";
    const explicit = "60000000-0000-4000-8000-000000000202";

    const result = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        operation(3, {
          entityType: "subscription",
          entityId: legacy,
          operationType: "create",
          payload: input,
        }),
      ],
    });
    const named = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        operation(4, {
          entityType: "subscription",
          entityId: explicit,
          operationType: "create",
          payload: { ...input, name: "Local gym", currency: "PHP" },
        }),
      ],
    });

    expect(result.results[0]).toMatchObject({ status: "acknowledged" });
    expect(named.results[0]).toMatchObject({ status: "acknowledged" });
    expect(currencyOf(database, "subscriptions", legacy)).toBe("USD");
    expect(chargeCurrency(database, legacy)).toBe("USD");
    expect(currencyOf(database, "subscriptions", explicit)).toBe("PHP");
    expect(chargeCurrency(database, explicit)).toBe("PHP");
  });
});
