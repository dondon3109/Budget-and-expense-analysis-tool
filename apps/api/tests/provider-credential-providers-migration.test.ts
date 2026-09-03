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

function freshLegacyDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, "0046_provider_configs.sql");
  applyMigration(db, "0047_provider_credentials.sql");
  db.prepare(
    "INSERT INTO provider_credentials (id, provider, name, encrypted_secret, api_key_last4, updated_by) VALUES ('legacy-1', 'google', 'Google AI Studio Key', 'enc', 'r2PQ', 'admin')",
  ).run();
  return db;
}

describe("0048_provider_credential_providers", () => {
  it("carries existing rows over and admits multi-provider keys", () => {
    const db = freshLegacyDb();
    db.prepare(
      "INSERT INTO provider_configs (id, service, provider, model, display_name, credential_id, enabled, priority, is_active, updated_by) VALUES ('cfg-google', 'stt', 'google', 'm', 'google / m', 'legacy-1', 1, 1, 0, 'admin')",
    ).run();
    applyMigration(db, "0048_provider_credential_providers.sql");

    const link = db
      .prepare("SELECT credential_id FROM provider_configs WHERE id = 'cfg-google'")
      .get() as { credential_id: string | null };
    expect(link.credential_id).toBe("legacy-1");

    const rows = db
      .prepare("SELECT provider, name, encrypted_secret FROM provider_credentials")
      .all() as Array<{ provider: string; name: string; encrypted_secret: string }>;
    expect(rows).toEqual([
      { provider: "google", name: "Google AI Studio Key", encrypted_secret: "enc" },
    ]);

    for (const provider of ["deepseek", "openai", "anthropic", "gemini", "meta", "muse_spark"]) {
      db.prepare(
        "INSERT INTO provider_credentials (id, provider, name, encrypted_secret, api_key_last4, updated_by) VALUES (?, ?, ?, 'enc', '1234', 'admin')",
      ).run(`new-${provider}`, provider, `${provider} key`);
    }
    const count = db.prepare("SELECT COUNT(*) AS n FROM provider_credentials").get() as {
      n: number;
    };
    expect(count.n).toBe(7);
  });

  it("still rejects unknown providers and duplicate names", () => {
    const db = freshLegacyDb();
    applyMigration(db, "0048_provider_credential_providers.sql");

    expect(() =>
      db
        .prepare(
          "INSERT INTO provider_credentials (id, provider, name, encrypted_secret, api_key_last4, updated_by) VALUES ('bad-1', 'bogus_vendor', 'Bogus', 'enc', '1234', 'admin')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db
        .prepare(
          "INSERT INTO provider_credentials (id, provider, name, encrypted_secret, api_key_last4, updated_by) VALUES ('dup-1', 'google', 'Google AI Studio Key', 'enc', '5678', 'admin')",
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
