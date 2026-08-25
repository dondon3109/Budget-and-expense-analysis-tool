import { describe, expect, it } from "vitest";

import { d1RateLimiter, deleteExpiredRateLimits } from "../src/rate-limit";

function createDatabase() {
  const queries: Array<{ query: string; bindings: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      let captured: unknown[] = [];
      const statement = {
        bind(...bindings: unknown[]) {
          captured = bindings;
          return statement;
        },
        async first() {
          queries.push({ query, bindings: captured });
          if (query.includes("ON CONFLICT")) return { count: 1 };
          throw new Error(`Unexpected first query: ${query}`);
        },
        async run() {
          queries.push({ query, bindings: captured });
          if (query.includes("DELETE FROM rate_limits")) return { meta: { changes: 4 } };
          throw new Error(`Unexpected run query: ${query}`);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { queries, db };
}

describe("d1RateLimiter.consume", () => {
  it("counts the window with a single upsert and never deletes on the request path", async () => {
    const { queries, db } = createDatabase();
    const decision = await d1RateLimiter.consume({ DB: db }, "client-ip", {
      scope: "tenant-write",
      limit: 60,
      windowSeconds: 60,
    });

    expect(decision).toMatchObject({ allowed: true, limit: 60, remaining: 59 });
    expect(queries).toHaveLength(1);
    expect(queries[0]!.query).toContain("ON CONFLICT(id) DO UPDATE SET count = count + 1");
    expect(queries.some((q) => q.query.includes("DELETE"))).toBe(false);
  });
});

describe("deleteExpiredRateLimits", () => {
  it("deletes counters whose expiry has passed and reports the removed rows", async () => {
    const { queries, db } = createDatabase();
    const deleted = await deleteExpiredRateLimits({ DB: db });

    expect(deleted).toBe(4);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.query).toContain("DELETE FROM rate_limits WHERE expires_at < ?");
  });
});
