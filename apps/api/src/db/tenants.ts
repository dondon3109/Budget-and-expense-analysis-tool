import { HttpError } from "../errors";
import type { AuthUser, Bindings, TenantContext } from "../types";

const SYSTEM_ACCOUNTS = [
  { suffix: "default", name: "Cash", type: "cash", systemKey: "account:cash" },
  { suffix: "bank", name: "Bank", type: "checking", systemKey: "account:bank" },
  { suffix: "gcash", name: "GCash", type: "other", systemKey: "account:gcash" },
] as const;

const DEFAULT_CATEGORIES = [
  { key: "salary", name: "Salary", kind: "income", color: "#2a78d6", systemKey: null },
  { key: "housing", name: "Housing", kind: "expense", color: "#008300", systemKey: null },
  {
    key: "food",
    name: "Food & dining",
    kind: "expense",
    color: "#e87ba4",
    systemKey: null,
  },
  {
    key: "transport",
    name: "Transport",
    kind: "expense",
    color: "#eda100",
    systemKey: null,
  },
  {
    key: "utilities",
    name: "Utilities",
    kind: "expense",
    color: "#1baf7a",
    systemKey: null,
  },
  {
    key: "leisure",
    name: "Leisure",
    kind: "expense",
    color: "#eb6834",
    systemKey: null,
  },
  {
    key: "savings-transfer",
    name: "Savings transfer",
    kind: "transfer",
    color: "#4a3aa7",
    systemKey: null,
  },
  {
    key: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#6b7280",
    systemKey: "uncategorized:income",
  },
  {
    key: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    systemKey: "uncategorized:expense",
  },
  {
    key: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    systemKey: "uncategorized:transfer",
  },
] as const;

export interface TenantBootstrapRepository {
  bootstrap(env: Bindings, user: AuthUser): Promise<TenantContext>;
}

export interface TenantResolver {
  resolve(env: Bindings, user: AuthUser): Promise<TenantContext>;
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
          "INSERT OR IGNORE INTO categories (id, tenant_id, name, kind, color, system_key) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(
          defaultCategoryIdForTenant(tenantId, category.key),
          tenantId,
          category.name,
          category.kind,
          category.color,
          category.systemKey,
        ),
      ),
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
    return { tenantId: mapping.tenantId, defaultAccountId };
  },
};

export function createTenantResolver(
  bootstrapRepository: TenantBootstrapRepository = tenantBootstrapRepository,
): TenantResolver {
  return {
    async resolve(env, user) {
      const deleted = await env.DB.prepare("SELECT 1 FROM account_deletions WHERE user_id = ?")
        .bind(user.id)
        .first();
      if (deleted) {
        throw new HttpError(410, "account_deleted", "This account has been deleted.");
      }

      const existing = await env.DB.prepare(
        "SELECT tenant_id AS tenantId FROM user_tenants WHERE user_id = ?",
      )
        .bind(user.id)
        .first<{ tenantId: string }>();
      if (existing) {
        return {
          tenantId: existing.tenantId,
          defaultAccountId: defaultAccountIdForTenant(existing.tenantId),
        };
      }
      return bootstrapRepository.bootstrap(env, user);
    },
  };
}

export const tenantResolver = createTenantResolver();
