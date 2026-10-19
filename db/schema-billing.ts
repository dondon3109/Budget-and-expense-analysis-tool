import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { tenants, timestamps } from "./schema";

// Paid plans, checkouts, provider events, monthly usage, and trials, split out of schema.ts
// (re-exported there) to keep it under its ceiling.

export const billingCustomers = sqliteTable(
  "billing_customers",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["paypal", "dodo"] }).notNull(),
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
    provider: text("provider", { enum: ["paypal", "dodo"] }).notNull(),
    // `zoption_pro` on checkouts the previous Worker opened; a plan key from this release on.
    plan: text("plan", {
      enum: ["zoption_pro", "budget", "pro", "family_budget", "family_pro"],
    }).notNull(),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    familyTenantId: text("family_tenant_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    providerCheckoutId: text("provider_checkout_id"),
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
        sql`${table.completedAt} IS NULL AND ${table.supersededAt} IS NULL AND (${table.providerSubscriptionId} IS NOT NULL OR ${table.providerCheckoutId} IS NOT NULL)`,
      ),
    uniqueIndex("billing_checkout_references_tenant_open_unique")
      .on(table.tenantId)
      .where(sql`${table.completedAt} IS NULL AND ${table.supersededAt} IS NULL`),
    uniqueIndex("billing_checkout_references_provider_checkout_unique")
      .on(table.provider, table.providerCheckoutId)
      .where(sql`${table.providerCheckoutId} IS NOT NULL`),
  ],
);

export const billingSubscriptions = sqliteTable(
  "billing_subscriptions",
  {
    provider: text("provider", { enum: ["paypal", "dodo"] }).notNull(),
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
    plan: text("plan", { enum: ["budget", "pro", "family_budget", "family_pro"] }),
    // The family a family plan covers; no foreign key so a purged family never reads as personal.
    familyTenantId: text("family_tenant_id"),
    entitledPlan: text("entitled_plan", {
      enum: ["budget", "pro", "family_budget", "family_pro"],
    }),
    entitledUntil: text("entitled_until"),
    pendingPlan: text("pending_plan", { enum: ["budget", "pro", "family_budget", "family_pro"] }),
    pendingInterval: text("pending_interval", { enum: ["month", "year"] }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerSubscriptionId] }),
    index("billing_subscriptions_tenant_status_idx").on(table.tenantId, table.status),
    index("billing_subscriptions_tenant_provider_idx").on(table.tenantId, table.provider),
    index("billing_subscriptions_family_idx")
      .on(table.familyTenantId)
      .where(sql`${table.familyTenantId} IS NOT NULL`),
  ],
);

export const billingWebhookEvents = sqliteTable(
  "billing_webhook_events",
  {
    provider: text("provider", { enum: ["paypal", "dodo"] }).notNull(),
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
    // Keep in step with billingFeatures in packages/shared/src/types.ts.
    feature: text("feature", {
      enum: ["ai_usage", "file_import"],
    }).notNull(),
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

export const proTrials = sqliteTable(
  "pro_trials",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    endsAt: text("ends_at").notNull(),
    startedEmailAt: text("started_email_at"),
    endingEmailAt: text("ending_email_at"),
    endedEmailAt: text("ended_email_at"),
    emailFailures: integer("email_failures").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("pro_trials_pending_email_idx")
      .on(table.endsAt)
      .where(sql`${table.endedEmailAt} IS NULL`),
  ],
);
