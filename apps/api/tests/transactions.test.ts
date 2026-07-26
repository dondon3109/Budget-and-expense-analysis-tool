import { describe, expect, it } from "vitest";

import { transactionRepository } from "../src/db/transactions";
import type { Bindings } from "../src/types";

interface CapturedStatement {
  query: string;
  bindings: unknown[];
}

function createCapturingDatabase(statements: CapturedStatement[]): D1Database {
  return {
    prepare(query: string) {
      return {
        bind(...bindings: unknown[]) {
          statements.push({ query, bindings });
          return {
            async raw() {
              return query.toLowerCase().includes("count(") ? [[0]] : [];
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("transactionRepository search", () => {
  it("searches transaction text and tenant-scoped related names with escaped literals", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await transactionRepository.list(env, "tenant-1", {
      page: 1,
      pageSize: 10,
      sortBy: "date",
      sortDirection: "desc",
      search: "50%_off\\deal",
    });

    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.query).toContain('"transactions"."description" LIKE ? ESCAPE');
      expect(statement.query).toContain('COALESCE("transactions"."notes", \'\') LIKE ? ESCAPE');
      expect(statement.query).toContain('FROM "accounts"');
      expect(statement.query).toContain('"accounts"."tenant_id" = ?');
      expect(statement.query).toContain('FROM "categories"');
      expect(statement.query).toContain('"categories"."tenant_id" = ?');
      expect(statement.bindings).toContain("%50\\%\\_off\\\\deal%");
      expect(
        statement.bindings.filter((value) => value === "tenant-1").length,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
