import type { WorkspaceList, WorkspaceRole } from "@zoption/shared";

import type { Bindings } from "../types";
import { tenantIdForUser } from "./tenants";

/** The workspaces one person can switch between, keyed by the user id from the auth context. */
export interface MembershipRepository {
  list(env: Bindings, userId: string): Promise<WorkspaceList>;
}

export const membershipRepository: MembershipRepository = {
  async list(env, userId) {
    // The personal workspace first (the caller always owns it), then families by join date.
    const { results } = await env.DB.prepare(
      `SELECT id, kind, name, role FROM (
         SELECT t.id, t.kind, t.name, 'owner' AS role, 0 AS rank, t.created_at AS joined
         FROM tenants t WHERE t.id = ?1
         UNION ALL
         SELECT t.id, t.kind, t.name, tm.role, 1 AS rank, tm.created_at AS joined
         FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
         WHERE tm.user_id = ?2 AND t.kind = 'family'
       ) ORDER BY rank, joined, id`,
    )
      .bind(tenantIdForUser(userId), userId)
      .all<{ id: string; kind: "user" | "family"; name: string; role: WorkspaceRole }>();
    return { workspaces: results };
  },
};
