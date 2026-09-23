import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

function applyMigration(db: DatabaseSync, filename: string): void {
  const sql = readFileSync(`db/migrations/${filename}`, "utf8");
  for (const statement of sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)) {
    db.exec(statement);
  }
}

function seededDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, "0046_provider_configs.sql");
  applyMigration(db, "0047_provider_credentials.sql");
  return db;
}

function assistantRows(db: DatabaseSync) {
  return db
    .prepare(
      "SELECT id, model, display_name, is_active FROM provider_configs WHERE service = 'assistant' ORDER BY id",
    )
    .all();
}

describe("0063_deepseek_flash_model", () => {
  it("moves the retired seed model to deepseek-flash and keeps it active", () => {
    const db = seededDb();
    applyMigration(db, "0063_deepseek_flash_model.sql");

    expect(assistantRows(db)).toEqual([
      {
        id: "a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1",
        model: "deepseek-flash",
        display_name: "deepseek / deepseek-flash",
        is_active: 1,
      },
    ]);
  });

  it("keeps an admin's custom display name", () => {
    const db = seededDb();
    db.exec("UPDATE provider_configs SET display_name = 'Primary' WHERE service = 'assistant'");
    applyMigration(db, "0063_deepseek_flash_model.sql");

    expect(assistantRows(db)).toMatchObject([{ model: "deepseek-flash", display_name: "Primary" }]);
  });

  it("leaves the old row alone when a deepseek-flash config already exists", () => {
    const db = seededDb();
    db.exec(
      "INSERT INTO provider_configs (id, service, provider, model, display_name, enabled, priority, is_active) VALUES ('z-new', 'assistant', 'deepseek', 'deepseek-flash', 'Flash', 1, 2, 0)",
    );
    applyMigration(db, "0063_deepseek_flash_model.sql");

    expect(assistantRows(db)).toMatchObject([
      { id: "a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1", model: "deepseek-v4-flash" },
      { id: "z-new", model: "deepseek-flash" },
    ]);
  });
});
