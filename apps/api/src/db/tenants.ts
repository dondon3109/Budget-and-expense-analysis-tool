import type { AuthUser, Bindings, TenantContext } from "../types";

const DEFAULT_CATEGORIES = [
  { key: "salary", name: "Salary", kind: "income", color: "#2a78d6" },
  { key: "housing", name: "Housing", kind: "expense", color: "#008300" },
  { key: "food", name: "Food & dining", kind: "expense", color: "#e87ba4" },
  { key: "transport", name: "Transport", kind: "expense", color: "#eda100" },
  { key: "utilities", name: "Utilities", kind: "expense", color: "#1baf7a" },
  { key: "leisure", name: "Leisure", kind: "expense", color: "#eb6834" },
  {
    key: "savings-transfer",
    name: "Savings transfer",
    kind: "transfer",
    color: "#4a3aa7",
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
      env.DB.prepare(
        "INSERT OR IGNORE INTO accounts (id, tenant_id, name, type) VALUES (?, ?, 'Everyday account', 'checking')",
      ).bind(defaultAccountId, tenantId),
      ...DEFAULT_CATEGORIES.map((category) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO categories (id, tenant_id, name, kind, color) VALUES (?, ?, ?, ?, ?)",
        ).bind(
          defaultCategoryIdForTenant(tenantId, category.key),
          tenantId,
          category.name,
          category.kind,
          category.color,
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
