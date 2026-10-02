import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Provider routing tables, split out of schema.ts (re-exported there) to keep it under its ceiling.
// Self-contained on purpose: schema.ts evaluates this module first, so it cannot import from it.

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

export const providerCredentials = sqliteTable(
  "provider_credentials",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    apiKeyLast4: text("api_key_last4").notNull(),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_credentials_provider_name_unique").on(table.provider, table.name),
    index("provider_credentials_provider_idx").on(table.provider),
    index("provider_credentials_updated_at_idx").on(table.updatedAt),
    check(
      "provider_credentials_provider_check",
      sql`${table.provider} IN ('deepseek', 'google', 'cloudflare_workers_ai', 'fish_audio')`,
    ),
    check(
      "provider_credentials_name_len_check",
      sql`length(${table.name}) >= 2 AND length(${table.name}) <= 40`,
    ),
    check("provider_credentials_last4_len_check", sql`length(${table.apiKeyLast4}) = 4`),
  ],
);

export const providerConfigs = sqliteTable(
  "provider_configs",
  {
    id: text("id").primaryKey(),
    service: text("service", { enum: ["assistant", "stt", "tts"] }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    displayName: text("display_name").notNull(),
    credentialId: text("credential_id").references(() => providerCredentials.id, {
      onDelete: "restrict",
    }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    priority: integer("priority").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_configs_service_active_unique")
      .on(table.service)
      .where(sql`${table.isActive} = 1`),
    uniqueIndex("provider_configs_service_provider_model_unique").on(
      table.service,
      table.provider,
      table.model,
    ),
    index("provider_configs_service_priority_idx").on(table.service, table.priority),
    index("provider_configs_credential_idx").on(table.credentialId),
    check(
      "provider_configs_priority_check",
      sql`${table.priority} >= 1 AND ${table.priority} <= 100`,
    ),
    check("provider_configs_service_check", sql`${table.service} IN ('assistant', 'stt', 'tts')`),
  ],
);

export const providerConfigAudits = sqliteTable(
  "provider_config_audits",
  {
    id: text("id").primaryKey(),
    configId: text("config_id"),
    service: text("service", { enum: ["assistant", "stt", "tts"] }).notNull(),
    action: text("action", {
      enum: ["create", "update", "activate", "deactivate", "delete", "reorder"],
    }).notNull(),
    oldValueJson: text("old_value_json"),
    newValueJson: text("new_value_json"),
    changedBy: text("changed_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("provider_config_audits_service_created_idx").on(table.service, table.createdAt),
    index("provider_config_audits_config_idx").on(table.configId),
    check(
      "provider_config_audits_action_check",
      sql`${table.action} IN ('create', 'update', 'activate', 'deactivate', 'delete', 'reorder')`,
    ),
  ],
);
