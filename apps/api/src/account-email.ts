import type { Bindings } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * The address the account signs in with. Supabase owns it, so it is read at delivery time
 * instead of being mirrored into D1 where it would go stale after an address change.
 */
export async function recipientAddress(
  env: Bindings,
  tenantId: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const baseUrl = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceRoleKey) return null;

  const owner = await env.DB.prepare(
    "SELECT user_id AS userId FROM user_tenants WHERE tenant_id = ? LIMIT 1",
  )
    .bind(tenantId)
    .first<{ userId: string }>();
  if (!owner?.userId) return null;

  const response = await fetcher(
    `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(owner.userId)}`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok) return null;

  const payload: unknown = await response.json().catch(() => null);
  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const nested =
    typeof record.user === "object" && record.user !== null
      ? (record.user as Record<string, unknown>)
      : record;
  const email = typeof nested.email === "string" ? nested.email.trim() : "";
  return EMAIL_PATTERN.test(email) ? email : null;
}
