import { describe, expect, it } from "vitest";

import { getCustomCategoryAllowance } from "../src/db/billing";
import { categoryRepository } from "../src/db/categories";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

function categoryEnvironment(binding: D1Database): Bindings {
  return { DB: binding };
}

/** Reproduces D1's aggregate write count when an INSERT or UPDATE also fires sync triggers. */
class TriggerInclusiveStatement implements D1PreparedStatement {
  constructor(private statement: D1PreparedStatement) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.statement = this.statement.bind(...values);
    return this;
  }

  first<T = unknown>(columnName?: string): Promise<T | null> {
    return columnName === undefined
      ? this.statement.first<T>()
      : this.statement.first<T>(columnName);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = await this.statement.run<T>();
    return {
      ...result,
      meta: {
        ...result.meta,
        changes: (result.meta.changes ?? 0) + 2,
        rows_written: (result.meta.rows_written ?? 0) + 2,
      },
    };
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.statement.all<T>();
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    return options?.columnNames
      ? this.statement.raw<T>({ columnNames: true })
      : this.statement.raw<T>();
  }
}

function withTriggerInclusiveChanges(binding: D1Database): D1Database {
  return {
    prepare(query) {
      const statement = binding.prepare(query);
      const trimmed = query.trimStart();
      return trimmed.startsWith("UPDATE categories") || trimmed.startsWith("INSERT INTO categories")
        ? new TriggerInclusiveStatement(statement)
        : statement;
    },
    batch: binding.batch.bind(binding),
    exec: binding.exec.bind(binding),
    withSession: binding.withSession.bind(binding),
    dump: binding.dump.bind(binding),
  };
}

function createTenant(
  database: ReturnType<typeof createD1TestDatabase>["database"],
  tenantId: string,
): void {
  database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', ?)")
    .run(tenantId, tenantId);
}

function grantPlatformAdminPro(
  database: ReturnType<typeof createD1TestDatabase>["database"],
  tenantId: string,
): void {
  const userId = `${tenantId}-admin`;
  database
    .prepare("INSERT INTO user_tenants (user_id, tenant_id) VALUES (?, ?)")
    .run(userId, tenantId);
  database
    .prepare("INSERT INTO platform_admin_grants (user_id, complimentary_pro_enabled) VALUES (?, 1)")
    .run(userId);
}

function insertArchivedProCategory(
  database: ReturnType<typeof createD1TestDatabase>["database"],
  tenantId: string,
  id: string,
): void {
  database
    .prepare(
      `INSERT INTO categories (id, tenant_id, name, kind, color, archived, origin, required_plan)
       VALUES (?, ?, 'Archived Pro', 'expense', '#123456', 1, 'custom', 'zoption_pro')`,
    )
    .run(id, tenantId);
}

function grantActivePaypalPro(
  database: ReturnType<typeof createD1TestDatabase>["database"],
  tenantId: string,
): void {
  database
    .prepare(
      `INSERT INTO billing_subscriptions
        (provider, provider_subscription_id, tenant_id, provider_product_id, provider_plan_id,
         provider_status, status, interval, current_period_ends_at, cancel_at_period_end,
         last_provider_occurred_at, last_provider_event_id)
       VALUES ('paypal', ?, ?, 'product', 'P-plan', 'active', 'active', 'month',
               datetime('now', '+30 days'), 0, datetime('now'), ?)`,
    )
    .run(`sub-${tenantId}`, tenantId, `evt-${tenantId}`);
}

describe("categoryRepository entitlement enforcement", () => {
  it("creates another custom category for a platform-admin Pro tenant already at the Free limit", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "pro-tenant";
    createTenant(database, tenantId);
    const env = categoryEnvironment(binding);

    await categoryRepository.create(env, tenantId, {
      name: "Existing free category",
      kind: "expense",
      color: "#111111",
    });
    grantPlatformAdminPro(database, tenantId);

    await expect(
      categoryRepository.create(env, tenantId, {
        name: "Additional Pro category",
        kind: "expense",
        color: "#222222",
      }),
    ).resolves.toMatchObject({
      name: "Additional Pro category",
      origin: "custom",
      requiredPlan: "zoption_pro",
      locked: false,
    });
  });

  it("keeps the exact Free custom-category limit response", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "free-tenant";
    createTenant(database, tenantId);
    const env = categoryEnvironment(binding);

    await categoryRepository.create(env, tenantId, {
      name: "Only free category",
      kind: "expense",
      color: "#111111",
    });

    await expect(
      categoryRepository.create(env, tenantId, {
        name: "Blocked free category",
        kind: "expense",
        color: "#222222",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "resource_limit_reached",
      details: {
        resource: "custom_category",
        used: 1,
        limit: 1,
        billingPath: "/app/settings#plan-and-billing",
      },
    });
  });

  it("creates a fourth custom category for an effective-Pro tenant already using three", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "effective-pro-tenant";
    createTenant(database, tenantId);
    grantActivePaypalPro(database, tenantId);
    const env = categoryEnvironment(binding);

    for (const name of ["Pro A", "Pro B", "Pro C"]) {
      await categoryRepository.create(env, tenantId, { name, kind: "expense", color: "#111111" });
    }

    await expect(
      categoryRepository.create(env, tenantId, {
        name: "Pro D",
        kind: "expense",
        color: "#222222",
      }),
    ).resolves.toMatchObject({
      name: "Pro D",
      origin: "custom",
      requiredPlan: "zoption_pro",
      locked: false,
    });
  });

  it("creates a custom category for an effective-Pro tenant when sync triggers report aggregate changes", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "trigger-inclusive-pro-tenant";
    createTenant(database, tenantId);
    grantActivePaypalPro(database, tenantId);
    const env = categoryEnvironment(withTriggerInclusiveChanges(binding));

    await expect(
      categoryRepository.create(env, tenantId, {
        name: "New Pro Category",
        kind: "expense",
        color: "#2a78d6",
      }),
    ).resolves.toMatchObject({
      name: "New Pro Category",
      origin: "custom",
      requiredPlan: "zoption_pro",
      locked: false,
    });
  });

  it("reports an unlimited custom-category allowance for an effective-Pro tenant at usage 3", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "effective-pro-allowance";
    createTenant(database, tenantId);
    grantActivePaypalPro(database, tenantId);
    const env = categoryEnvironment(binding);

    for (const name of ["Pro A", "Pro B", "Pro C"]) {
      await categoryRepository.create(env, tenantId, { name, kind: "expense", color: "#111111" });
    }

    await expect(getCustomCategoryAllowance(env, tenantId)).resolves.toEqual({
      resource: "custom_category",
      used: 3,
      limit: null,
    });
  });

  it("restores an archived Pro custom category for a platform-admin Pro tenant", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "restore-pro-tenant";
    createTenant(database, tenantId);
    grantPlatformAdminPro(database, tenantId);
    insertArchivedProCategory(database, tenantId, "archived-pro-category");

    await expect(
      categoryRepository.update(
        categoryEnvironment(withTriggerInclusiveChanges(binding)),
        tenantId,
        "archived-pro-category",
        {
          archived: false,
        },
      ),
    ).resolves.toMatchObject({
      archived: false,
      origin: "custom",
      requiredPlan: "zoption_pro",
      locked: false,
    });
  });

  it("keeps archived Pro custom categories locked for tenants without an entitlement", async () => {
    const { binding, database } = createD1TestDatabase();
    const tenantId = "restore-free-tenant";
    createTenant(database, tenantId);
    insertArchivedProCategory(database, tenantId, "archived-pro-category");

    await expect(
      categoryRepository.update(categoryEnvironment(binding), tenantId, "archived-pro-category", {
        archived: false,
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "category_requires_pro",
      details: { requiredPlan: "zoption_pro", billingPath: "/app/settings" },
    });
  });
});
