import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

export const platformAdminGrants = sqliteTable("platform_admin_grants", {
  userId: text("user_id").primaryKey(),
  complimentaryProEnabled: integer("complimentary_pro_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  disabledAt: text("disabled_at"),
  ...timestamps,
});

export const appUserIdentities = sqliteTable(
  "app_user_identities",
  {
    userId: text("user_id").primaryKey(),
    verifiedEmail: text("verified_email").notNull(),
    verifiedAt: text("verified_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    ...timestamps,
  },
  (table) => [uniqueIndex("app_user_identities_verified_email_unique").on(table.verifiedEmail)],
);

export const sponsoredProSeats = sqliteTable(
  "sponsored_pro_seats",
  {
    sponsorUserId: text("sponsor_user_id")
      .notNull()
      .references(() => platformAdminGrants.userId, { onDelete: "cascade" }),
    slotNumber: integer("slot_number").notNull(),
    state: text("state", { enum: ["empty", "pending", "active"] })
      .notNull()
      .default("empty"),
    pendingEmail: text("pending_email"),
    beneficiaryUserId: text("beneficiary_user_id"),
    invitedAt: text("invited_at"),
    inviteLastSentAt: text("invite_last_sent_at"),
    inviteSendLeaseUntil: text("invite_send_lease_until"),
    inviteSendLeaseToken: text("invite_send_lease_token"),
    assignedAt: text("assigned_at"),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.sponsorUserId, table.slotNumber] }),
    index("sponsored_pro_seats_sponsor_state_idx").on(table.sponsorUserId, table.state),
    uniqueIndex("sponsored_pro_seats_active_beneficiary_unique")
      .on(table.beneficiaryUserId)
      .where(sql`${table.state} = 'active'`),
    uniqueIndex("sponsored_pro_seats_pending_email_unique")
      .on(table.pendingEmail)
      .where(sql`${table.state} = 'pending'`),
  ],
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
    currency: text("currency").notNull().default("PHP"),
    systemKey: text("system_key"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("accounts_tenant_idx").on(table.tenantId),
    uniqueIndex("accounts_tenant_system_key_unique").on(table.tenantId, table.systemKey),
  ],
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
    systemKey: text("system_key"),
    origin: text("origin", { enum: ["starter", "custom", "system"] })
      .notNull()
      .default("custom"),
    requiredPlan: text("required_plan", { enum: ["free", "zoption_pro"] })
      .notNull()
      .default("free"),
    ...timestamps,
  },
  (table) => [
    index("categories_tenant_idx").on(table.tenantId),
    index("categories_tenant_origin_archived_idx").on(table.tenantId, table.origin, table.archived),
    index("categories_tenant_origin_required_plan_archived_idx").on(
      table.tenantId,
      table.origin,
      table.requiredPlan,
      table.archived,
    ),
    uniqueIndex("categories_tenant_kind_name_unique").on(table.tenantId, table.kind, table.name),
    uniqueIndex("categories_tenant_system_key_unique").on(table.tenantId, table.systemKey),
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
    transferGroupId: text("transfer_group_id"),
    importFingerprint: text("import_fingerprint"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("transactions_tenant_date_idx").on(table.tenantId, table.date),
    index("transactions_tenant_category_idx").on(table.tenantId, table.categoryId),
    index("transactions_tenant_account_idx").on(table.tenantId, table.accountId),
    index("transactions_tenant_transfer_group_idx").on(table.tenantId, table.transferGroupId),
    uniqueIndex("transactions_tenant_fingerprint_unique").on(
      table.tenantId,
      table.importFingerprint,
    ),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("PHP"),
    billingCycle: text("billing_cycle", { enum: ["monthly", "yearly"] }).notNull(),
    nextBillingDate: text("next_billing_date").notNull(),
    status: text("status", { enum: ["active", "canceled"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (table) => [
    index("subscriptions_tenant_idx").on(table.tenantId),
    index("subscriptions_tenant_status_idx").on(table.tenantId, table.status),
    index("subscriptions_tenant_category_idx").on(table.tenantId, table.categoryId),
  ],
);

export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: text("date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [index("calendar_events_tenant_date_idx").on(table.tenantId, table.date)],
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

export const assistantThreads = sqliteTable(
  "assistant_threads",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lastMessageAt: text("last_message_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    retentionExpiresAt: text("retention_expires_at").notNull(),
    activeRunId: text("active_run_id"),
    activeRunExpiresAt: text("active_run_expires_at"),
    ...timestamps,
  },
  (table) => [
    index("assistant_threads_tenant_last_message_idx").on(table.tenantId, table.lastMessageAt),
    index("assistant_threads_retention_idx").on(table.retentionExpiresAt),
  ],
);

export const assistantMessages = sqliteTable(
  "assistant_messages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    status: text("status", { enum: ["pending", "completed", "failed"] }).notNull(),
    clientRequestId: text("client_request_id"),
    replyToMessageId: text("reply_to_message_id"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    finishReason: text("finish_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("assistant_messages_tenant_thread_created_idx").on(
      table.tenantId,
      table.threadId,
      table.createdAt,
    ),
    uniqueIndex("assistant_messages_tenant_client_request_unique").on(
      table.tenantId,
      table.clientRequestId,
    ),
  ],
);

export const assistantPreferences = sqliteTable("assistant_preferences", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  consentedAt: text("consented_at"),
  assistantName: text("assistant_name"),
  userPreferredName: text("user_preferred_name"),
  retentionDays: integer("retention_days").notNull().default(90),
  ...timestamps,
});

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

// This table intentionally has no foreign key to tenants: it blocks automatic
// workspace recreation by a still-valid access token after account deletion.
export const accountDeletions = sqliteTable(
  "account_deletions",
  {
    userId: text("user_id").primaryKey(),
    requestedAt: text("requested_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    tenantDeletedAt: text("tenant_deleted_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    storagePurgedAt: text("storage_purged_at"),
    authDeletedAt: text("auth_deleted_at"),
    cleanupAttempts: integer("cleanup_attempts").notNull().default(0),
    cleanupLeaseUntil: text("cleanup_lease_until"),
    lastErrorCode: text("last_error_code"),
  },
  (table) => [
    index("account_deletions_pending_cleanup_idx").on(table.authDeletedAt, table.cleanupLeaseUntil),
  ],
);

export const billingCustomers = sqliteTable(
  "billing_customers",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    paddleCustomerId: text("paddle_customer_id").notNull(),
    email: text("email"),
    ...timestamps,
  },
  (table) => [uniqueIndex("billing_customers_paddle_customer_unique").on(table.paddleCustomerId)],
);

export const billingCheckoutReferences = sqliteTable(
  "billing_checkout_references",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    plan: text("plan", { enum: ["zoption_pro"] }).notNull(),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    paddlePriceId: text("paddle_price_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    supersededAt: text("superseded_at"),
    ...timestamps,
  },
  (table) => [
    index("billing_checkout_references_tenant_expiry_idx").on(table.tenantId, table.expiresAt),
    uniqueIndex("billing_checkout_references_tenant_open_unique")
      .on(table.tenantId)
      .where(sql`${table.completedAt} IS NULL AND ${table.supersededAt} IS NULL`),
  ],
);

export const billingSubscriptions = sqliteTable(
  "billing_subscriptions",
  {
    paddleSubscriptionId: text("paddle_subscription_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    paddleCustomerId: text("paddle_customer_id").notNull(),
    paddleProductId: text("paddle_product_id").notNull(),
    paddlePriceId: text("paddle_price_id").notNull(),
    status: text("status").notNull(),
    interval: text("interval", { enum: ["month", "year"] }),
    currentPeriodEndsAt: text("current_period_ends_at"),
    scheduledChangeAt: text("scheduled_change_at"),
    lastPaddleOccurredAt: text("last_paddle_occurred_at").notNull(),
    lastPaddleEventId: text("last_paddle_event_id").notNull().default(""),
    ...timestamps,
  },
  (table) => [index("billing_subscriptions_tenant_status_idx").on(table.tenantId, table.status)],
);

export const billingWebhookEvents = sqliteTable(
  "billing_webhook_events",
  {
    paddleEventId: text("paddle_event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    processedAt: text("processed_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("billing_webhook_events_occurred_idx").on(table.occurredAt)],
);

export const billingMonthlyUsage = sqliteTable(
  "billing_monthly_usage",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    feature: text("feature", { enum: ["assistant_question", "file_import"] }).notNull(),
    count: integer("count").notNull().default(0),
    allowance: integer("allowance").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("billing_monthly_usage_tenant_month_feature_unique").on(
      table.tenantId,
      table.month,
      table.feature,
    ),
  ],
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
