import { supabaseAdminUserResponseSchema } from "@zoption/shared";

import type { Bindings } from "./types";

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

  const parsed = supabaseAdminUserResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return null;
  return "user" in parsed.data ? parsed.data.user.email : parsed.data.email;
}
