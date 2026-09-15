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
});
