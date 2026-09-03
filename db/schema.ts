import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
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
    interestEnabled: integer("interest_enabled", { mode: "boolean" }).notNull().default(false),
    annualRateBasisPoints: integer("annual_rate_basis_points"),
    interestFrequency: text("interest_frequency", { enum: ["daily", "monthly", "yearly"] }),
    interestPayDay: integer("interest_pay_day"),
    revision: integer("revision").notNull().default(1),
    deletedAt: text("deleted_at"),
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
    iconEmoji: text("icon_emoji"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    systemKey: text("system_key"),
    origin: text("origin", { enum: ["starter", "custom", "system"] })
      .notNull()
      .default("custom"),
    requiredPlan: text("required_plan", { enum: ["free", "zoption_pro"] })
      .notNull()
      .default("free"),
    revision: integer("revision").notNull().default(1),
    deletedAt: text("deleted_at"),
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
    sourceKind: text("source_kind", { enum: ["manual", "import"] })
      .notNull()
      .default("manual"),
    importId: text("import_id"),
    importRowNumber: integer("import_row_number"),
    notes: text("notes"),
    transferFeeMinor: integer("transfer_fee_minor"),
    subscriptionId: text("subscription_id"),
    revision: integer("revision").notNull().default(1),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (table) => [
    index("transactions_tenant_date_idx").on(table.tenantId, table.date),
    index("transactions_tenant_category_idx").on(table.tenantId, table.categoryId),
    index("transactions_tenant_account_idx").on(table.tenantId, table.accountId),
    index("transactions_tenant_transfer_group_idx").on(table.tenantId, table.transferGroupId),
    index("transactions_tenant_import_idx").on(table.tenantId, table.importId),
    index("transactions_tenant_subscription_idx").on(table.tenantId, table.subscriptionId),
    uniqueIndex("transactions_tenant_fingerprint_unique").on(
      table.tenantId,
      table.importFingerprint,
    ),
  ],
);

export const mobileSyncState = sqliteTable(
  "mobile_sync_state",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(0),
    retentionFloorSequence: integer("retention_floor_sequence").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    check(
      "mobile_sync_state_retention_floor_nonnegative",
      sql`${table.retentionFloorSequence} >= 0`,
    ),
  ],
);

export const mobileSyncClients = sqliteTable(
  "mobile_sync_clients",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    acknowledgedSequence: integer("acknowledged_sequence").notNull().default(0),
    lastSeenAt: text("last_seen_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    expiresAt: text("expires_at")
      .notNull()
      .default(sql`(datetime('now', '+90 days'))`),
    snapshotSequence: integer("snapshot_sequence"),
    snapshotExpiresAt: text("snapshot_expires_at"),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.clientId] }),
    index("mobile_sync_clients_expiry_idx").on(
      table.tenantId,
      table.expiresAt,
      table.acknowledgedSequence,
    ),
    check(
      "mobile_sync_clients_acknowledged_sequence_nonnegative",
      sql`${table.acknowledgedSequence} >= 0`,
    ),
    check(
      "mobile_sync_clients_snapshot_sequence_nonnegative",
      sql`${table.snapshotSequence} IS NULL OR ${table.snapshotSequence} >= 0`,
    ),
    check(
      "mobile_sync_clients_snapshot_pair_check",
      sql`(${table.snapshotSequence} IS NULL) = (${table.snapshotExpiresAt} IS NULL)`,
    ),
  ],
);

export const mobileSyncChanges = sqliteTable(
  "mobile_sync_changes",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    entityType: text("entity_type", { enum: ["account", "category", "transaction"] }).notNull(),
    entityId: text("entity_id").notNull(),
    rowRevision: integer("row_revision").notNull(),
    operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
    payloadJson: text("payload_json"),
    serverUpdatedAt: text("server_updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.sequence] }),
    index("mobile_sync_changes_tenant_entity_idx").on(
      table.tenantId,
      table.entityType,
      table.entityId,
    ),
  ],
);

export const transferGroups = sqliteTable(
  "transfer_groups",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromTransactionId: text("from_transaction_id").notNull(),
    toTransactionId: text("to_transaction_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    uniqueIndex("transfer_groups_tenant_from_unique").on(table.tenantId, table.fromTransactionId),
    uniqueIndex("transfer_groups_tenant_to_unique").on(table.tenantId, table.toTransactionId),
    check(
      "transfer_groups_distinct_legs_check",
      sql`${table.fromTransactionId} != ${table.toTransactionId}`,
    ),
  ],
);

export const mobileSyncChangeGroups = sqliteTable(
  "mobile_sync_change_groups",
  {
    tenantId: text("tenant_id").notNull(),
    sequence: integer("sequence").notNull(),
    atomicGroupId: text("atomic_group_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.sequence] }),
    foreignKey({
      columns: [table.tenantId, table.sequence],
      foreignColumns: [mobileSyncChanges.tenantId, mobileSyncChanges.sequence],
    }).onDelete("cascade"),
    index("mobile_sync_change_groups_atomic_idx").on(
      table.tenantId,
      table.atomicGroupId,
      table.sequence,
    ),
  ],
);

export const mobileSyncIdempotency = sqliteTable(
  "mobile_sync_idempotency",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.clientId, table.idempotencyKey] }),
    index("mobile_sync_idempotency_created_idx").on(table.createdAt),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
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
    index("subscriptions_tenant_account_idx").on(table.tenantId, table.accountId),
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

export const financialGoals = sqliteTable(
  "financial_goals",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmountMinor: integer("target_amount_minor").notNull(),
    currentAmountMinor: integer("current_amount_minor").notNull().default(0),
    targetDate: text("target_date").notNull(),
    status: text("status", { enum: ["active", "paused", "completed"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (table) => [
    index("financial_goals_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("financial_goals_tenant_name_unique").on(table.tenantId, table.name),
  ],
);

export const debts = sqliteTable(
  "debts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["credit_card", "personal_loan", "auto_loan", "mortgage", "other"],
    }).notNull(),
    balanceMinor: integer("balance_minor").notNull(),
    aprBasisPoints: integer("apr_basis_points").notNull(),
    minimumPaymentMinor: integer("minimum_payment_minor").notNull(),
    balanceAsOf: text("balance_as_of").notNull(),
    status: text("status", { enum: ["active", "paid"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (table) => [
    index("debts_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("debts_tenant_name_unique").on(table.tenantId, table.name),
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
    kind: text("kind", { enum: ["text", "voice"] }).notNull().default("text"),
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
    responseMetadataJson: text("response_metadata_json"),
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
  consentVersion: integer("consent_version").notNull().default(0),
  voiceConsentedAt: text("voice_consented_at"),
  voiceConsentVersion: integer("voice_consent_version").notNull().default(0),
  assistantName: text("assistant_name"),
  userPreferredName: text("user_preferred_name"),
  responseDetail: text("response_detail", { enum: ["concise", "standard"] })
    .notNull()
    .default("concise"),
  coachingStyle: text("coaching_style", { enum: ["gentle", "direct"] })
    .notNull()
    .default("gentle"),
  retentionDays: integer("retention_days").notNull().default(90),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const receiptPreferences = sqliteTable("receipt_preferences", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  consentedAt: text("consented_at"),
  consentVersion: integer("consent_version").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const assistantMemories = sqliteTable(
  "assistant_memories",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["preference", "fact", "summary"] }).notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: text("source", {
      enum: ["user_stated", "deterministic", "model_assisted"],
    }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    expiresAt: text("expires_at"),
  },
  (table) => [
    index("assistant_memories_tenant_kind_idx").on(table.tenantId, table.kind),
    uniqueIndex("assistant_memories_tenant_kind_key_unique").on(
      table.tenantId,
      table.kind,
      table.key,
    ),
  ],
);

export const assistantModelMemoryPassUsage = sqliteTable(
  "assistant_model_memory_pass_usage",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    anchorAtEpoch: integer("anchor_at_epoch").notNull(),
    periodIndex: integer("period_index").notNull().default(0),
    count: integer("count").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    check("assistant_model_memory_pass_usage_anchor_nonnegative", sql`${table.anchorAtEpoch} >= 0`),
    check("assistant_model_memory_pass_usage_period_nonnegative", sql`${table.periodIndex} >= 0`),
    check(
      "assistant_model_memory_pass_usage_count_range",
      sql`${table.count} >= 0 AND ${table.count} <= 8`,
    ),
  ],
);

export const assistantRuns = sqliteTable(
  "assistant_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    userMessageId: text("user_message_id").notNull(),
    assistantMessageId: text("assistant_message_id"),
    promptVersion: text("prompt_version").notNull(),
    compliancePolicyJson: text("compliance_policy_json").notNull(),
    resolvedPeriodJson: text("resolved_period_json"),
    requiredToolGroupsJson: text("required_tool_groups_json").notNull(),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    validationStatus: text("validation_status", {
      enum: ["not_required", "passed", "fallback"],
    }).notNull(),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("assistant_runs_tenant_thread_idx").on(table.tenantId, table.threadId),
    uniqueIndex("assistant_runs_user_message_unique").on(table.userMessageId),
  ],
);

export const assistantToolCalls = sqliteTable(
  "assistant_tool_calls",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => assistantRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    toolName: text("tool_name").notNull(),
    argumentsJson: text("arguments_json").notNull(),
    resultJson: text("result_json"),
    errorCode: text("error_code"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("assistant_tool_calls_tenant_run_idx").on(table.tenantId, table.runId),
    uniqueIndex("assistant_tool_calls_run_sequence_unique").on(table.runId, table.sequence),
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
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["paypal"] }).notNull(),
    providerCustomerId: text("provider_customer_id"),
    email: text("email"),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.provider] })],
);

export const billingCheckoutReferences = sqliteTable(
  "billing_checkout_references",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["paypal"] }).notNull(),
    plan: text("plan", { enum: ["zoption_pro"] }).notNull(),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    supersededAt: text("superseded_at"),
    lastReconciledAt: text("last_reconciled_at"),
    reconciliationAttempts: integer("reconciliation_attempts").notNull().default(0),
    lastProviderStatus: text("last_provider_status"),
    lastReconciliationError: text("last_reconciliation_error"),
    ...timestamps,
  },
  (table) => [
    index("billing_checkout_references_tenant_expiry_idx").on(table.tenantId, table.expiresAt),
    index("billing_checkout_references_reconciliation_idx")
      .on(table.lastReconciledAt, table.createdAt)
      .where(
        sql`${table.completedAt} IS NULL AND ${table.supersededAt} IS NULL AND ${table.providerSubscriptionId} IS NOT NULL`,
      ),
    uniqueIndex("billing_checkout_references_tenant_open_unique")
      .on(table.tenantId)
      .where(sql`${table.completedAt} IS NULL AND ${table.supersededAt} IS NULL`),
  ],
);

export const billingSubscriptions = sqliteTable(
  "billing_subscriptions",
  {
    provider: text("provider", { enum: ["paypal"] }).notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    providerCustomerId: text("provider_customer_id"),
    providerProductId: text("provider_product_id"),
    providerPlanId: text("provider_plan_id").notNull(),
    providerStatus: text("provider_status").notNull(),
    status: text("status").notNull(),
    interval: text("interval", { enum: ["month", "year"] }),
    currentPeriodEndsAt: text("current_period_ends_at"),
    scheduledChangeAt: text("scheduled_change_at"),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
      .notNull()
      .default(false),
    lastProviderOccurredAt: text("last_provider_occurred_at").notNull(),
    lastProviderEventId: text("last_provider_event_id").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerSubscriptionId] }),
    index("billing_subscriptions_tenant_status_idx").on(table.tenantId, table.status),
    index("billing_subscriptions_tenant_provider_idx").on(table.tenantId, table.provider),
  ],
);

export const billingWebhookEvents = sqliteTable(
  "billing_webhook_events",
  {
    provider: text("provider", { enum: ["paypal"] }).notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    processedAt: text("processed_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerEventId] }),
    index("billing_webhook_events_occurred_idx").on(table.occurredAt),
  ],
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

export const billingAssistantCycleUsage = sqliteTable(
  "billing_assistant_cycle_usage",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    anchorAtEpoch: integer("anchor_at_epoch").notNull(),
    periodIndex: integer("period_index").notNull().default(0),
    count: integer("count").notNull().default(0),
    allowance: integer("allowance").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    check("billing_assistant_cycle_usage_anchor_nonnegative", sql`${table.anchorAtEpoch} >= 0`),
    check("billing_assistant_cycle_usage_period_nonnegative", sql`${table.periodIndex} >= 0`),
    check("billing_assistant_cycle_usage_count_nonnegative", sql`${table.count} >= 0`),
    check("billing_assistant_cycle_usage_allowance_positive", sql`${table.allowance} > 0`),
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

export const fxRates = sqliteTable(
  "fx_rates",
  {
    date: text("date").primaryKey(),
    usdToPhp: real("usd_to_php").notNull(),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [index("fx_rates_fetched_at_idx").on(table.fetchedAt)],
);

export const bugReports = sqliteTable(
  "bug_reports",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id").notNull(),
    reporterEmail: text("reporter_email"),
    clientRequestId: text("client_request_id").notNull(),
    title: text("title").notNull(),
    category: text("category", {
      enum: ["ui", "data", "import", "billing", "authentication", "performance", "other"],
    }).notNull(),
    actualBehavior: text("actual_behavior").notNull(),
    expectedBehavior: text("expected_behavior").notNull(),
    stepsToReproduce: text("steps_to_reproduce").notNull(),
    frequency: text("frequency", {
      enum: ["once", "sometimes", "always", "unknown"],
    }).notNull(),
    pageContext: text("page_context", {
      enum: [
        "dashboard",
        "assistant",
        "calendar",
        "transactions",
        "import",
        "budgets",
        "subscriptions",
        "plan",
        "settings",
        "app",
      ],
    }).notNull(),
    diagnosticsJson: text("diagnostics_json").notNull(),
    status: text("status", {
      enum: ["new", "triaged", "needs_info", "in_progress", "resolved", "closed", "duplicate"],
    })
      .notNull()
      .default("new"),
    notificationStatus: text("notification_status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    notificationAttempts: integer("notification_attempts").notNull().default(0),
    notificationLeaseUntil: text("notification_lease_until"),
    lastNotificationErrorCode: text("last_notification_error_code"),
    notifiedAt: text("notified_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bug_reports_reference_unique").on(table.reference),
    uniqueIndex("bug_reports_tenant_client_request_unique").on(
      table.tenantId,
      table.clientRequestId,
    ),
    index("bug_reports_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("bug_reports_status_updated_idx").on(table.status, table.updatedAt),
    index("bug_reports_notification_retry_idx").on(
      table.notificationStatus,
      table.notificationLeaseUntil,
      table.notificationAttempts,
    ),
    check("bug_reports_notification_attempts_nonnegative", sql`${table.notificationAttempts} >= 0`),
  ],
);

export const customerReviews = sqliteTable(
  "customer_reviews",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id").notNull(),
    displayName: text("display_name").notNull(),
    rating: integer("rating").notNull(),
    review: text("review").notNull(),
    published: integer("published", { mode: "boolean" }).notNull().default(true),
    moderationStatus: text("moderation_status", {
      enum: ["pending", "published", "hidden"],
    })
      .notNull()
      .default("pending"),
    featuredOrder: integer("featured_order"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_reviews_tenant_unique").on(table.tenantId),
    index("customer_reviews_published_updated_idx").on(table.published, table.updatedAt),
    index("customer_reviews_moderation_updated_idx").on(table.moderationStatus, table.updatedAt),
    uniqueIndex("customer_reviews_featured_order_unique").on(table.featuredOrder),
    check("customer_reviews_rating_check", sql`${table.rating} BETWEEN 1 AND 5`),
    check(
      "customer_reviews_moderation_status_check",
      sql`${table.moderationStatus} IN ('pending', 'published', 'hidden')`,
    ),
    check(
      "customer_reviews_featured_order_check",
      sql`${table.featuredOrder} IS NULL OR ${table.featuredOrder} BETWEEN 1 AND 6`,
    ),
  ],
);

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
    check("provider_credentials_name_len_check", sql`length(${table.name}) >= 2 AND length(${table.name}) <= 40`),
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
    credentialId: text("credential_id").references(() => providerCredentials.id, { onDelete: "restrict" }),
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
    check("provider_configs_priority_check", sql`${table.priority} >= 1 AND ${table.priority} <= 100`),
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
