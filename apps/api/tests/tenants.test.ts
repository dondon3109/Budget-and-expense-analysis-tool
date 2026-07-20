import { describe, expect, it } from "vitest";

import {
  defaultAccountIdForTenant,
  defaultCategoryIdForTenant,
  tenantBootstrapRepository,
  tenantIdForUser,
} from "../src/db/tenants";
import type { Bindings } from "../src/types";

interface CapturedStatement {
  sql: string;
  values: unknown[];
}

function createBindings(mappingFound = true) {
  const captured: CapturedStatement[] = [];
  const batches: D1PreparedStatement[][] = [];
  const database: D1Database = {
    prepare(sql) {
      const statement = {
        bind(...values: unknown[]) {
          captured.push({ sql, values });
          return statement;
        },
        async first() {
          if (mappingFound && sql.includes("SELECT tenant_id")) {
            return { tenantId: "user:user-1" };
          }
          return null;
        },
        async run() {
          throw new Error("run is not used in this test");
        },
        async all() {
          throw new Error("all is not used in this test");
        },
        async raw() {
          throw new Error("raw is not used in this test");
        },
      } as D1PreparedStatement;
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      batches.push(statements);
      return [] as D1Result<T>[];
    },
    async exec() {
      throw new Error("exec is not used in this test");
    },
    withSession() {
      throw new Error("withSession is not used in this test");
    },
    async dump() {
      throw new Error("dump is not used in this test");
    },
  };

  return { env: { DB: database } as Bindings, captured, batches };
}

describe("tenant bootstrap", () => {
  it("derives stable tenant-owned IDs", () => {
    const tenantId = tenantIdForUser("user-1");
    expect(tenantId).toBe("user:user-1");
    expect(defaultAccountIdForTenant(tenantId)).toBe("user:user-1:account:default");
    expect(defaultCategoryIdForTenant(tenantId, "food")).toBe("user:user-1:category:food");
  });

  it("batches tenant, mapping, account, and category creation atomically and idempotently", async () => {
    const { env, captured, batches } = createBindings();
    const user = { id: "user-1", email: "person@example.com" };

    await expect(tenantBootstrapRepository.bootstrap(env, user)).resolves.toEqual({
      tenantId: "user:user-1",
      defaultAccountId: "user:user-1:account:default",
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(10);

    function findStatement(fragment: string): CapturedStatement {
      const match = captured.find((statement) => statement.sql.includes(fragment));
      if (!match) throw new Error(`No statement matched "${fragment}".`);
      return match;
    }

    expect(findStatement("INSERT OR IGNORE INTO tenants").values).toEqual([
      "user:user-1",
      "Personal budget",
    ]);
    expect(findStatement("INSERT OR IGNORE INTO user_tenants").values).toEqual([
      "user-1",
      "user:user-1",
    ]);
    expect(findStatement("INSERT OR IGNORE INTO accounts").values).toEqual([
      "user:user-1:account:default",
      "user:user-1",
    ]);
    expect(
      captured.find((statement) => statement.values.includes("user:user-1:category:food"))?.values,
    ).toEqual(["user:user-1:category:food", "user:user-1", "Food & dining", "expense", "#e87ba4"]);
    expect(
      captured
        .filter((statement) => statement.sql.startsWith("INSERT"))
        .every((statement) => statement.sql.includes("INSERT OR IGNORE")),
    ).toBe(true);
    expect(findStatement("SELECT tenant_id").values).toEqual(["user-1"]);
  });

  it("fails closed when the identity mapping is not visible after bootstrap", async () => {
    const { env } = createBindings(false);
    await expect(tenantBootstrapRepository.bootstrap(env, { id: "user-1" })).rejects.toThrow(
      "could not be initialized",
    );
  });
});
