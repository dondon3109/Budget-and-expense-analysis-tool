import { afterEach, describe, expect, it } from "vitest";

import { assistantRepository } from "../src/db/assistant";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_A = "user:tenant-a";
const TENANT_B = "user:tenant-b";
const THREAD_ID = "11111111-1111-4111-8111-111111111111";

const databases: ReturnType<typeof createD1TestDatabase>["database"][] = [];

function environment() {
  const d1 = createD1TestDatabase();
  databases.push(d1.database);
  for (const [id, name] of [
    [TENANT_A, "Tenant A"],
    [TENANT_B, "Tenant B"],
  ] as const) {
    d1.database
      .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, ?, ?)")
      .run(id, "user", name);
  }
  return { env: { DB: d1.binding } as Bindings, database: d1.database };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** A stored chat; pass an expiry in the past to reach cleanupExpired's memory sweep. */
function insertThread(
  database: ReturnType<typeof createD1TestDatabase>["database"],
  expiry: string,
) {
  database
    .prepare(
      `INSERT INTO assistant_threads
       (id, tenant_id, title, last_message_at, retention_expires_at, created_at, updated_at)
       VALUES (?, ?, 'Old chat', ?, ?, ?, ?)`,
    )
    .run(THREAD_ID, TENANT_A, expiry, expiry, expiry, expiry);
}

describe("assistantRepository memory writes", () => {
  it("updates a fact for the owning tenant", async () => {
    const { env } = environment();
    const fact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "monthly_budget_cap",
      value: "Monthly budget PHP 20,000",
      source: "deterministic",
    });

    const updated = await assistantRepository.updateMemoryValue(
      env,
      TENANT_A,
      fact.id,
      "Monthly budget PHP 30,000",
    );

    expect(updated?.value).toBe("Monthly budget PHP 30,000");
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "fact", "monthly_budget_cap"),
    ).resolves.toMatchObject({ value: "Monthly budget PHP 30,000" });
  });

  it("does not let another tenant update or delete a fact", async () => {
    const { env } = environment();
    const fact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "checking_buffer",
      value: "Keep 5,000 in checking",
      source: "deterministic",
    });

    await expect(
      assistantRepository.updateMemoryValue(env, TENANT_B, fact.id, "hijacked"),
    ).resolves.toBeNull();
    await expect(
      assistantRepository.deleteMemoryById(env, TENANT_B, fact.id),
    ).resolves.toBeUndefined();

    await expect(
      assistantRepository.getMemory(env, TENANT_A, "fact", "checking_buffer"),
    ).resolves.toMatchObject({ value: "Keep 5,000 in checking" });
  });

  it("keeps thread summaries out of user edits", async () => {
    const { env } = environment();
    const summary = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "summary",
      key: `thread:${THREAD_ID}`,
      value: "Earlier in this chat",
      source: "deterministic",
    });

    await expect(
      assistantRepository.updateMemoryValue(env, TENANT_A, summary.id, "rewritten"),
    ).resolves.toBeNull();
    await expect(
      assistantRepository.deleteMemoryById(env, TENANT_A, summary.id),
    ).resolves.toBeUndefined();

    await expect(
      assistantRepository.getMemory(env, TENANT_A, "summary", summary.key),
    ).resolves.toMatchObject({ value: "Earlier in this chat" });
  });

  it("marks a user-edited fact as user-stated", async () => {
    const { env } = environment();
    const fact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "payday_schedule",
      value: "Paid every 15th",
      source: "deterministic",
    });

    const updated = await assistantRepository.updateMemoryValue(
      env,
      TENANT_A,
      fact.id,
      "Paid every 30th",
    );

    expect(updated?.source).toBe("user_stated");
  });

  it("keeps the thread that first produced a memory as its provenance", async () => {
    const { env } = environment();
    const firstThread = "11111111-1111-4111-8111-111111111111";
    const secondThread = "22222222-2222-4222-8222-222222222222";
    const fact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "checking_buffer",
      value: "Keep 5,000 in checking",
      source: "deterministic",
      threadId: firstThread,
    });

    const updated = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "checking_buffer",
      value: "Keep 6,000 in checking",
      source: "deterministic",
      threadId: secondThread,
    });

    expect(updated.id).toBe(fact.id);
    expect(updated.threadId).toBe(firstThread);
  });

  it("drains an overflow larger than a single compaction batch", async () => {
    const { env } = environment();
    for (let index = 0; index < 60; index += 1) {
      await assistantRepository.upsertMemory(env, TENANT_A, {
        kind: "fact",
        key: `fact_${index}`,
        value: `Fact ${index}`,
        source: "deterministic",
      });
    }

    await expect(assistantRepository.countFacts(env, TENANT_A)).resolves.toBe(60);
    await expect(assistantRepository.compactFacts(env, TENANT_A, 5)).resolves.toBe(55);
    await expect(assistantRepository.countFacts(env, TENANT_A)).resolves.toBe(5);
  });

  it("keeps thread summaries out of the bounded memory list", async () => {
    const { env, database } = environment();
    const fact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "monthly_budget_cap",
      value: "Monthly budget PHP 30,000",
      source: "deterministic",
    });
    // Summaries are rewritten every turn, so ordering them against facts would let
    // them fill the LIMIT window and hide durable facts from the panel and prompt.
    for (let index = 0; index < 3; index += 1) {
      const summary = await assistantRepository.upsertMemory(env, TENANT_A, {
        kind: "summary",
        key: `thread:${index}`,
        value: `Summary ${index}`,
        source: "deterministic",
      });
      database
        .prepare("UPDATE assistant_memories SET updated_at = ? WHERE id = ?")
        .run(`2026-09-0${index + 1}T00:00:00.000Z`, summary.id);
    }
    database
      .prepare("UPDATE assistant_memories SET updated_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", fact.id);

    const listed = await assistantRepository.listMemories(env, TENANT_A);
    expect(listed.map((memory) => memory.key)).toEqual(["monthly_budget_cap"]);
    // The current thread summary stays reachable by key.
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "summary", "thread:1"),
    ).resolves.toMatchObject({ value: "Summary 1" });
  });

  it("compacts the oldest facts and keeps preferences", async () => {
    const { env, database } = environment();
    const preference = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "preference",
      key: "debt_strategy",
      value: "avalanche",
      source: "user_stated",
    });
    const oldestFact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "payday_schedule",
      value: "Paid every 15th",
      source: "deterministic",
    });
    const newestFact = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "monthly_budget_cap",
      value: "Monthly budget PHP 30,000",
      source: "deterministic",
    });
    // Rows written in the same millisecond would tie on updated_at, so age them
    // explicitly. The preference is the oldest row of all: only the fact-only
    // eviction rule keeps it.
    const age = database.prepare("UPDATE assistant_memories SET updated_at = ? WHERE id = ?");
    age.run("2026-01-01T00:00:00.000Z", preference.id);
    age.run("2026-02-01T00:00:00.000Z", oldestFact.id);
    age.run("2026-03-01T00:00:00.000Z", newestFact.id);

    await expect(assistantRepository.countFacts(env, TENANT_A)).resolves.toBe(2);
    await expect(assistantRepository.compactFacts(env, TENANT_A, 1)).resolves.toBe(1);

    await expect(
      assistantRepository.getMemory(env, TENANT_A, "fact", "payday_schedule"),
    ).resolves.toBeNull();
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "fact", "monthly_budget_cap"),
    ).resolves.not.toBeNull();
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "preference", "debt_strategy"),
    ).resolves.not.toBeNull();
  });

  it("keeps permanent memory past the retention window and through the cron sweep", async () => {
    const { env, database } = environment();
    await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "payday_schedule",
      value: "Paid every 15th",
      source: "deterministic",
    });
    await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "preference",
      key: "debt_strategy",
      value: "avalanche",
      source: "user_stated",
    });

    const permanent = database
      .prepare("SELECT COUNT(*) AS count FROM assistant_memories WHERE expires_at IS NULL")
      .get() as { count: number };
    expect(permanent.count).toBe(2);

    // Age both rows past the 90 days the old write path armed.
    const aged = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    database
      .prepare("UPDATE assistant_memories SET created_at = ?, updated_at = ?")
      .run(aged, aged);

    // listMemories is the query the prompt context loads, so surviving it means both
    // still reach the model and the Memory panel.
    const listed = await assistantRepository.listMemories(env, TENANT_A);
    expect(listed.map((memory) => memory.key).sort()).toEqual(["debt_strategy", "payday_schedule"]);
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "fact", "payday_schedule"),
    ).resolves.toMatchObject({ value: "Paid every 15th" });
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "preference", "debt_strategy"),
    ).resolves.toMatchObject({ value: "avalanche" });

    insertThread(database, aged);
    await expect(assistantRepository.cleanupExpired(env, TENANT_A)).resolves.toBe(1);
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "fact", "payday_schedule"),
    ).resolves.not.toBeNull();
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "preference", "debt_strategy"),
    ).resolves.not.toBeNull();
  });

  it("keeps thread summaries on the retention clock", async () => {
    const { env, database } = environment();
    const summary = await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "summary",
      key: `thread:${THREAD_ID}`,
      value: "Earlier in this chat",
      source: "deterministic",
    });
    const armed = database
      .prepare("SELECT expires_at FROM assistant_memories WHERE id = ?")
      .get(summary.id) as { expires_at: string | null };
    expect(armed.expires_at).not.toBeNull();

    const lapsed = new Date(Date.now() - 60_000).toISOString();
    database
      .prepare("UPDATE assistant_memories SET expires_at = ? WHERE id = ?")
      .run(lapsed, summary.id);
    insertThread(database, lapsed);

    await expect(assistantRepository.cleanupExpired(env, TENANT_A)).resolves.toBe(1);
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "summary", summary.key),
    ).resolves.toBeNull();
  });

  it("never counts or evicts a fact the user stated", async () => {
    const { env, database } = environment();
    const age = database.prepare("UPDATE assistant_memories SET updated_at = ? WHERE id = ?");
    for (let index = 0; index < 3; index += 1) {
      const stated = await assistantRepository.upsertMemory(env, TENANT_A, {
        kind: "fact",
        key: `stated_${index}`,
        value: `User fact ${index}`,
        source: "user_stated",
      });
      age.run(`2026-01-0${index + 1}T00:00:00.000Z`, stated.id);
    }
    for (let index = 0; index < 3; index += 1) {
      const learned = await assistantRepository.upsertMemory(env, TENANT_A, {
        kind: "fact",
        key: `learned_${index}`,
        value: `Learned fact ${index}`,
        source: "deterministic",
      });
      age.run(`2026-02-0${index + 1}T00:00:00.000Z`, learned.id);
    }

    // Only evictable facts count, so the overflow math cannot chase rows it can never delete.
    await expect(assistantRepository.countFacts(env, TENANT_A)).resolves.toBe(3);
    await expect(assistantRepository.compactFacts(env, TENANT_A, 1)).resolves.toBe(2);
    await expect(assistantRepository.countFacts(env, TENANT_A)).resolves.toBe(1);

    const remaining = await assistantRepository.listMemories(env, TENANT_A, "fact");
    expect(remaining.map((memory) => memory.key).sort()).toEqual([
      "learned_2",
      "stated_0",
      "stated_1",
      "stated_2",
    ]);
  });

  it("keeps facts and preferences when every chat is deleted", async () => {
    const { env, database } = environment();
    insertThread(database, new Date().toISOString());
    await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "fact",
      key: "payday_schedule",
      value: "Paid every 15th",
      source: "deterministic",
    });
    await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "preference",
      key: "debt_strategy",
      value: "avalanche",
      source: "user_stated",
    });
    await assistantRepository.upsertMemory(env, TENANT_A, {
      kind: "summary",
      key: `thread:${THREAD_ID}`,
      value: "Earlier in this chat",
      source: "deterministic",
    });

    // "Delete all chats" is history cleanup: permanent memory survives it, while the
    // summary that embeds chat text goes with the thread.
    await assistantRepository.deleteAllThreads(env, TENANT_A);

    const remaining = await assistantRepository.listMemories(env, TENANT_A);
    expect(remaining.map((memory) => memory.key).sort()).toEqual([
      "debt_strategy",
      "payday_schedule",
    ]);
    await expect(
      assistantRepository.getMemory(env, TENANT_A, "summary", `thread:${THREAD_ID}`),
    ).resolves.toBeNull();
  });
});

describe("assistant memory permanent backfill", () => {
  it("clears only expiries that have not already lapsed", () => {
    const lapsed = "2020-01-01T00:00:00.000Z";
    const live = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { database } = createD1TestDatabase({
      beforeMigration: ({ database: migrating, name }) => {
        if (name !== "0060_assistant_permanent_memory.sql") return;
        migrating
          .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'Tenant A')")
          .run(TENANT_A);
        const insert = migrating.prepare(
          `INSERT INTO assistant_memories
           (id, tenant_id, kind, key, value, source, created_at, updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        insert.run(
          "lapsed-fact",
          TENANT_A,
          "fact",
          "payday_schedule",
          "Paid every 15th",
          "deterministic",
          lapsed,
          lapsed,
          lapsed,
        );
        insert.run(
          "live-fact",
          TENANT_A,
          "fact",
          "monthly_budget_cap",
          "Monthly budget PHP 20,000",
          "deterministic",
          lapsed,
          lapsed,
          live,
        );
        insert.run(
          "lapsed-preference",
          TENANT_A,
          "preference",
          "debt_strategy",
          "avalanche",
          "user_stated",
          lapsed,
          lapsed,
          lapsed,
        );
        insert.run(
          "live-summary",
          TENANT_A,
          "summary",
          "thread:1",
          "Earlier in this chat",
          "deterministic",
          lapsed,
          lapsed,
          live,
        );
      },
    });
    databases.push(database);

    const expiry = (id: string) =>
      (
        database.prepare("SELECT expires_at FROM assistant_memories WHERE id = ?").get(id) as {
          expires_at: string | null;
        }
      ).expires_at;

    // A row that lapsed before the backfill ran stays expired instead of being resurrected.
    expect(expiry("lapsed-fact")).toBe(lapsed);
    expect(expiry("lapsed-preference")).toBe(lapsed);
    expect(expiry("live-fact")).toBeNull();
    expect(expiry("live-summary")).toBe(live);
  });
});
