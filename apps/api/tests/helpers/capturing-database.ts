export interface CapturedStatement {
  query: string;
  bindings: unknown[];
}

/**
 * A D1 stand-in that records every bound statement and returns empty results, for asserting on
 * the SQL a repository builds. A `COUNT(*)` query reads `total`; `all` and `batch` read
 * `allResults`.
 */
export function createCapturingDatabase(
  statements: CapturedStatement[],
  options: { allResults?: unknown[]; total?: number } = {},
): D1Database {
  return {
    prepare(query: string) {
      return {
        bind(...bindings: unknown[]) {
          statements.push({ query, bindings });
          return {
            async first() {
              return query.includes("COUNT(*)") ? { total: options.total ?? 0 } : null;
            },
            async all() {
              return { results: options.allResults ?? [] };
            },
            async raw() {
              return [];
            },
          };
        },
      };
    },
    async batch(batchStatements: D1PreparedStatement[]) {
      return batchStatements.map(() => ({ results: options.allResults ?? [] }));
    },
  } as unknown as D1Database;
}
