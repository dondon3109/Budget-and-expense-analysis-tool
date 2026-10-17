import {
  DEBT_PAYMENT_CATEGORY_SYSTEM_KEY,
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  type WorkspaceRole,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { AuthUser, Bindings, TenantContext } from "../types";

export const PRO_TRIAL_DAYS = 7;

const SYSTEM_ACCOUNTS = [
  { suffix: "default", name: "Cash", type: "cash", systemKey: "account:cash" },
  { suffix: "bank", name: "Bank", type: "checking", systemKey: "account:bank" },
  { suffix: "gcash", name: "GCash", type: "other", systemKey: "account:gcash" },
] as const;

const DEFAULT_CATEGORIES = [
  {
    key: "salary",
    name: "Salary",
    kind: "income",
    color: "#2a78d6",
    iconEmoji: "💼",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "housing",
    name: "Housing",
    kind: "expense",
    color: "#008300",
    iconEmoji: "🏠",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "food",
    name: "Food & dining",
    kind: "expense",
    color: "#e87ba4",
    iconEmoji: "🍔",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "transport",
    name: "Transport",
    kind: "expense",
    color: "#eda100",
    iconEmoji: "🚗",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "utilities",
    name: "Utilities",
    kind: "expense",
    color: "#1baf7a",
    iconEmoji: "💡",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "leisure",
    name: "Leisure",
    kind: "expense",
    color: "#eb6834",
    iconEmoji: "🎁",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "debt-payment",
    name: "Debt payment",
    kind: "expense",
    color: "#e34948",
    iconEmoji: "🏦",
    systemKey: DEBT_PAYMENT_CATEGORY_SYSTEM_KEY,
    origin: "system",
  },
  {
    key: "savings-transfer",
    name: "Savings transfer",
    kind: "transfer",
    color: "#4a3aa7",
    iconEmoji: "💰",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: "uncategorized:income",
    origin: "system",
  },
  {
    key: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: "uncategorized:expense",
    origin: "system",
  },
  {
    key: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: "uncategorized:transfer",
    origin: "system",
  },
  {
    key: "opening-balance",
    name: "Opening balance",
    kind: "income",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
    origin: "system",
  },
  {
    key: "interest",
    name: "Interest",
    kind: "income",
    color: "#22c55e",
    iconEmoji: null,
    systemKey: "interest:income",
    origin: "system",
  },
] as const;

export interface TenantBootstrapRepository {
  bootstrap(env: Bindings, user: AuthUser): Promise<TenantContext>;
}

export interface TenantResolver {
  /** `workspaceId` is the requested family workspace; absent means the caller's personal one. */
  resolve(env: Bindings, user: AuthUser, workspaceId?: string): Promise<TenantContext>;
}

export function tenantIdForUser(userId: string): string {
  return `user:${userId}`;
}

export function defaultAccountIdForTenant(tenantId: string): string {
  return `${tenantId}:account:default`;
}

export function defaultCategoryIdForTenant(tenantId: string, key: string): string {
  return `${tenantId}:category:${key}`;
}

/** The accounts and categories every new workspace starts with, personal or family. */
export function starterStatements(env: Bindings, tenantId: string): D1PreparedStatement[] {
  const defaultAccountId = defaultAccountIdForTenant(tenantId);
  return [
    ...SYSTEM_ACCOUNTS.map((account) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO accounts (id, tenant_id, name, type, currency, system_key) VALUES (?, ?, ?, ?, 'PHP', ?)",
      ).bind(
        account.suffix === "default" ? defaultAccountId : `${tenantId}:account:${account.suffix}`,
        tenantId,
        account.name,
        account.type,
        account.systemKey,
      ),
    ),
    ...DEFAULT_CATEGORIES.map((category) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO categories (id, tenant_id, name, kind, color, icon_emoji, system_key, origin, required_plan, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free', ?)",
      ).bind(
        defaultCategoryIdForTenant(tenantId, category.key),
        tenantId,
        category.name,
        category.kind,
        category.color,
        category.iconEmoji,
        category.systemKey,
        category.origin,
        // The opening-balance category holds one system entry and is never offered in a picker.
        category.systemKey === OPENING_BALANCE_CATEGORY_SYSTEM_KEY ? 1 : 0,
      ),
    ),
  ];
}

export const tenantBootstrapRepository: TenantBootstrapRepository = {
  async bootstrap(env, user) {
    const tenantId = tenantIdForUser(user.id);
    const defaultAccountId = defaultAccountIdForTenant(tenantId);
    const statements = [
      env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name) VALUES (?, 'user', ?)").bind(
        tenantId,
        "Personal budget",
      ),
      env.DB.prepare("INSERT OR IGNORE INTO user_tenants (user_id, tenant_id) VALUES (?, ?)").bind(
        user.id,
        tenantId,
      ),
      // One no-card Pro trial per workspace; the cron sends its emails.
      env.DB.prepare(
        `INSERT OR IGNORE INTO pro_trials (tenant_id, started_at, ends_at)
         VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+${PRO_TRIAL_DAYS} days'))`,
      ).bind(tenantId),
      ...starterStatements(env, tenantId),
    ];

    await env.DB.batch(statements);
    const mapping = await env.DB.prepare(
      "SELECT tenant_id AS tenantId FROM user_tenants WHERE user_id = ?",
    )
      .bind(user.id)
      .first<{ tenantId: string }>();
    if (!mapping || mapping.tenantId !== tenantId) {
      throw new Error("The personal workspace could not be initialized.");
    }
    return { tenantId: mapping.tenantId, defaultAccountId, onboardingComplete: false };
  },
};

export function createTenantResolver(
  bootstrapRepository: TenantBootstrapRepository = tenantBootstrapRepository,
): TenantResolver {
  return {
    async resolve(env, user, workspaceId) {
      if (workspaceId && workspaceId !== tenantIdForUser(user.id)) {
        return resolveFamily(env, user, workspaceId);
      }
      // The account_deletions tombstone is enforced in the auth middleware, which every
      // authenticated path passes through before resolution. Keeping a second check here
      // would duplicate one indexed D1 read on every request.
      const existing = await env.DB.prepare(
        `SELECT ut.tenant_id AS tenantId, t.onboarding_step AS onboardingStep
         FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id
         WHERE ut.user_id = ?`,
      )
        .bind(user.id)
        .first<{ tenantId: string; onboardingStep: string }>();
      if (existing) {
        return {
          tenantId: existing.tenantId,
          defaultAccountId: defaultAccountIdForTenant(existing.tenantId),
          onboardingComplete: existing.onboardingStep === "complete",
        };
      }
      return bootstrapRepository.bootstrap(env, user);
    },
  };
}

/**
 * A family workspace resolves only through the caller's own `tenant_members` row. Anything else,
 * including another person's personal workspace, is the same 403 so ids cannot be probed.
 */
async function resolveFamily(
  env: Bindings,
  user: AuthUser,
  workspaceId: string,
): Promise<TenantContext> {
  const member = await env.DB.prepare(
    `SELECT tm.role AS role, fc.tenant_id IS NOT NULL AS closing
     FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
     LEFT JOIN family_closures fc ON fc.tenant_id = tm.tenant_id
     WHERE tm.tenant_id = ? AND tm.user_id = ? AND t.kind = 'family'`,
  )
    .bind(workspaceId, user.id)
    .first<{ role: WorkspaceRole; closing: number }>();
  if (!member) {
    throw new HttpError(403, "workspace_forbidden", "You are not a member of this workspace.");
  }
  return {
    tenantId: workspaceId,
    defaultAccountId: defaultAccountIdForTenant(workspaceId),
    // First-run onboarding belongs to the person's own workspace, never a shared one.
    onboardingComplete: true,
    membership: { role: member.role, closing: Boolean(member.closing) },
  };
}

export const tenantResolver = createTenantResolver();
