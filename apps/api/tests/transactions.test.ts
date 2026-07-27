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
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("transactionRepository search", () => {
  it("searches both sides of linked transfers with escaped literals", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };
    await transactionRepository.list(env, "tenant-1", {
      page: 1,
      pageSize: 10,
      sortBy: "date",
      sortDirection: "desc",
      search: "50%_off\\deal",
    });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain("LEFT JOIN transactions peer");
    expect(statements[0]?.query).toContain("COALESCE(destination.name, '') LIKE ? ESCAPE");
    expect(statements[0]?.query).toContain("t.tenant_id = ?");
    expect(statements[0]?.bindings).toContain("%50\\%\\_off\\\\deal%");
  });
});
