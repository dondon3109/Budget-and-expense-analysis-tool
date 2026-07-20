import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["user"] }).notNull(),
  name: text("name").notNull(),
  ...timestamps,
});

export const userTenants = sqliteTable(
  "user_tenants",
  {
    userId: text("user_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("user_tenants_tenant_unique").on(table.tenantId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["cash", "checking", "savings", "credit", "other"] }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [index("accounts_tenant_idx").on(table.tenantId)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["income", "expense", "transfer"] }).notNull(),
    color: text("color").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("categories_tenant_idx").on(table.tenantId),
    uniqueIndex("categories_tenant_name_unique").on(table.tenantId, table.name),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    date: text("date").notNull(),
    description: text("description").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("PHP"),
    kind: text("kind", { enum: ["income", "expense", "transfer"] }).notNull(),
    importFingerprint: text("import_fingerprint"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("transactions_tenant_date_idx").on(table.tenantId, table.date),
    index("transactions_tenant_category_idx").on(table.tenantId, table.categoryId),
    index("transactions_tenant_account_idx").on(table.tenantId, table.accountId),
    uniqueIndex("transactions_tenant_fingerprint_unique").on(
      table.tenantId,
      table.importFingerprint,
    ),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    month: text("month").notNull(),
    limitMinor: integer("limit_minor").notNull(),
    ...timestamps,
  },
  (table) => [
    index("budgets_tenant_month_idx").on(table.tenantId, table.month),
    uniqueIndex("budgets_tenant_month_category_unique").on(
      table.tenantId,
      table.month,
      table.categoryId,
    ),
  ],
);

export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    rowCount: integer("row_count").notNull(),
    acceptedCount: integer("accepted_count").notNull(),
    rejectedCount: integer("rejected_count").notNull(),
    ...timestamps,
  },
  (table) => [index("imports_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const importPreviews = sqliteTable(
  "import_previews",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    rowsJson: text("rows_json").notNull(),
    rowCount: integer("row_count").notNull(),
    acceptedCount: integer("accepted_count").notNull(),
    rejectedCount: integer("rejected_count").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("import_previews_tenant_expiry_idx").on(table.tenantId, table.expiresAt)],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    clientHash: text("client_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)],
);
