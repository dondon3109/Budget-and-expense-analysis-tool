import { describe, expect, it } from "vitest";

import { calendarEventRepository } from "../src/db/events";
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
              return [];
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("calendarEventRepository", () => {
  it("lists only the requested tenant and month", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await expect(
      calendarEventRepository.list(env, "tenant-1", { month: "2026-07-01" }),
    ).resolves.toEqual({ month: "2026-07-01", items: [] });

    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain('"calendar_events"."tenant_id" = ?');
    expect(statements[0]?.query).toContain('"calendar_events"."date" >= ?');
    expect(statements[0]?.query).toContain('"calendar_events"."date" < ?');
    expect(statements[0]?.query).toContain('order by "calendar_events"."date" asc');
    expect(statements[0]?.bindings).toEqual(["tenant-1", "2026-07-01", "2026-08-01"]);
  });

  it("scopes delete operations by both event and tenant IDs", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await expect(calendarEventRepository.remove(env, "tenant-1", "event-1")).rejects.toMatchObject({
      code: "event_not_found",
      status: 404,
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain('delete from "calendar_events"');
    expect(statements[0]?.query).toContain('"calendar_events"."id" = ?');
    expect(statements[0]?.query).toContain('"calendar_events"."tenant_id" = ?');
    expect(statements[0]?.bindings).toEqual(["event-1", "tenant-1"]);
  });

  it("scopes event lookups by both event and tenant IDs before updates", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await expect(
      calendarEventRepository.update(env, "tenant-1", "event-1", { title: "Updated" }),
    ).rejects.toMatchObject({ code: "event_not_found", status: 404 });

    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain('from "calendar_events"');
    expect(statements[0]?.query).toContain('"calendar_events"."id" = ?');
    expect(statements[0]?.query).toContain('"calendar_events"."tenant_id" = ?');
    expect(statements[0]?.bindings).toEqual(["event-1", "tenant-1", 1]);
  });
});
