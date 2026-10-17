import {
  FAMILY_INVITATION_DAYS,
  FAMILY_JOIN_COOLDOWN_DAYS,
  FAMILY_SEAT_COOLDOWN_DAYS,
  FAMILY_SEAT_LIMIT,
  FAMILY_SWAP_LIMIT_PER_YEAR,
  type FamilyDetail,
  type FamilyInvitation,
  type FamilyMember,
  type FamilyMemberRole,
  type FamilyPendingInvitation,
  type WorkspaceRole,
} from "@zoption/shared";

import type { Bindings } from "../types";
import { starterStatements } from "./tenants";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const daysAgo = (days: number) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${days} days')`;
const LIVE_INVITATION = `expires_at > ${NOW}`;
/** Seats held by members, unexpired invitations, and seats still cooling down after a departure. */
const SEATS_TAKEN = `(SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ?1)
  + (SELECT COUNT(*) FROM family_invitations WHERE tenant_id = ?1 AND ${LIVE_INVITATION})
  + (SELECT COUNT(*) FROM family_seat_events
     WHERE tenant_id = ?1 AND kind = 'freed' AND created_at > ${daysAgo(FAMILY_SEAT_COOLDOWN_DAYS)})`;
const SWAPS_USED = `(SELECT COUNT(*) FROM family_seat_events
  WHERE tenant_id = ?1 AND kind = 'freed' AND created_at > ${daysAgo(365)})`;

export interface InvitationDelivery {
  email: string;
  familyName: string;
  inviterEmail: string | null;
}

/**
 * Family workspaces, their members, and invitations. Rules that need several reads (who may do
 * what, the join cooldown) live in the service; anything that must hold under concurrent requests
 * (the seat cap, a single owner) is enforced here in one statement or by an index.
 */
export interface FamilyRepository {
  /** The email the person confirmed with Supabase, synced by `POST /api/app/identity`. */
  verifiedEmail(env: Bindings, userId: string): Promise<string | null>;
  membershipCount(env: Bindings, userId: string): Promise<number>;
  ownedFamilyId(env: Bindings, userId: string): Promise<string | null>;
  create(env: Bindings, ownerId: string, name: string): Promise<string>;
  detail(env: Bindings, tenantId: string, role: WorkspaceRole): Promise<FamilyDetail>;
  memberRole(env: Bindings, tenantId: string, userId: string): Promise<WorkspaceRole | null>;
  /** Inserts the invitation only while a seat is free and the yearly swap cap is not reached. */
  invite(
    env: Bindings,
    tenantId: string,
    email: string,
    role: FamilyMemberRole,
    invitedBy: string,
  ): Promise<string | null>;
  /** Marks an invitation as sent unless it was sent in the last minute. */
  claimDelivery(
    env: Bindings,
    tenantId: string,
    invitationId: string,
  ): Promise<InvitationDelivery | null>;
  revokeInvitation(env: Bindings, tenantId: string, invitationId: string): Promise<boolean>;
  invitationsFor(env: Bindings, email: string): Promise<FamilyInvitation[]>;
  invitationTenant(env: Bindings, email: string, invitationId: string): Promise<string | null>;
  hasRecentJoinElsewhere(env: Bindings, userId: string, tenantId: string): Promise<boolean>;
  accept(env: Bindings, userId: string, email: string, invitationId: string): Promise<boolean>;
  decline(env: Bindings, email: string, invitationId: string): Promise<boolean>;
  /** Removes a non-owner and starts that seat's cooldown. */
  freeSeat(env: Bindings, tenantId: string, userId: string): Promise<boolean>;
  setRole(
    env: Bindings,
    tenantId: string,
    userId: string,
    role: FamilyMemberRole,
  ): Promise<boolean>;
  transfer(env: Bindings, tenantId: string, ownerId: string, newOwnerId: string): Promise<boolean>;
}

export const familyRepository: FamilyRepository = {
  async verifiedEmail(env, userId) {
    const row = await env.DB.prepare(
      "SELECT verified_email AS email FROM app_user_identities WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ email: string }>();
    return row?.email ?? null;
  },

  async membershipCount(env, userId) {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM tenant_members WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  },

  async ownedFamilyId(env, userId) {
    const row = await env.DB.prepare(
      "SELECT tenant_id AS tenantId FROM tenant_members WHERE user_id = ? AND role = 'owner'",
    )
      .bind(userId)
      .first<{ tenantId: string }>();
    return row?.tenantId ?? null;
  },

  async create(env, ownerId, name) {
    const tenantId = `family:${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'family', ?)").bind(
        tenantId,
        name,
      ),
      // The owner index rejects a second family for the same person, which rolls back the batch.
      env.DB.prepare(
        "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, 'owner')",
      ).bind(tenantId, ownerId),
      ...starterStatements(env, tenantId),
    ]);
    return tenantId;
  },

  async detail(env, tenantId, role) {
    const [family, members, invitations, counts] = await Promise.all([
      env.DB.prepare("SELECT name FROM tenants WHERE id = ?")
        .bind(tenantId)
        .first<{ name: string }>(),
      env.DB.prepare(
        `SELECT tm.user_id AS userId, identity.verified_email AS email, tm.role,
                tm.created_at AS joinedAt
         FROM tenant_members tm
         LEFT JOIN app_user_identities identity ON identity.user_id = tm.user_id
         WHERE tm.tenant_id = ?
         ORDER BY tm.role = 'owner' DESC, tm.created_at, tm.user_id`,
      )
        .bind(tenantId)
        .all<FamilyMember>(),
      env.DB.prepare(
        `SELECT id, email, role, created_at AS createdAt, expires_at AS expiresAt
         FROM family_invitations WHERE tenant_id = ? AND ${LIVE_INVITATION}
         ORDER BY created_at, id`,
      )
        .bind(tenantId)
        .all<FamilyPendingInvitation>(),
      env.DB.prepare(
        `SELECT ${SEATS_TAKEN} AS taken, ${SWAPS_USED} AS swaps,
           (SELECT COUNT(*) FROM family_seat_events WHERE tenant_id = ?1 AND kind = 'freed'
            AND created_at > ${daysAgo(FAMILY_SEAT_COOLDOWN_DAYS)}) AS cooling`,
      )
        .bind(tenantId)
        .first<{ taken: number; swaps: number; cooling: number }>(),
    ]);
    if (!family || !counts) throw new Error("The family could not be read.");
    return {
      id: tenantId,
      name: family.name,
      role,
      members: members.results,
      invitations: invitations.results,
      seats: {
        limit: FAMILY_SEAT_LIMIT,
        used: counts.taken - counts.cooling,
        cooling: counts.cooling,
      },
      swaps: { limit: FAMILY_SWAP_LIMIT_PER_YEAR, used: counts.swaps },
    };
  },

  async memberRole(env, tenantId, userId) {
    const row = await env.DB.prepare(
      "SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?",
    )
      .bind(tenantId, userId)
      .first<{ role: WorkspaceRole }>();
    return row?.role ?? null;
  },

  async invite(env, tenantId, email, role, invitedBy) {
    const id = crypto.randomUUID();
    // An expired invitation for the same address would trip the unique index; it holds no seat.
    await env.DB.prepare(
      `DELETE FROM family_invitations WHERE tenant_id = ? AND email = ? AND NOT (${LIVE_INVITATION})`,
    )
      .bind(tenantId, email)
      .run();
    const result = await env.DB.prepare(
      `INSERT INTO family_invitations (id, tenant_id, email, role, invited_by, expires_at)
       SELECT ?2, ?1, ?3, ?4, ?5,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+${FAMILY_INVITATION_DAYS} days')
       WHERE ${SEATS_TAKEN} < ${FAMILY_SEAT_LIMIT} AND ${SWAPS_USED} < ${FAMILY_SWAP_LIMIT_PER_YEAR}`,
    )
      .bind(tenantId, id, email, role, invitedBy)
      .run();
    return (result.meta.changes ?? 0) > 0 ? id : null;
  },

  async claimDelivery(env, tenantId, invitationId) {
    const claimed = await env.DB.prepare(
      `UPDATE family_invitations SET last_sent_at = ${NOW}
       WHERE id = ? AND tenant_id = ? AND ${LIVE_INVITATION}
         AND (last_sent_at IS NULL OR last_sent_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 seconds'))`,
    )
      .bind(invitationId, tenantId)
      .run();
    if ((claimed.meta.changes ?? 0) === 0) return null;
    return env.DB.prepare(
      `SELECT invitation.email, tenant.name AS familyName, identity.verified_email AS inviterEmail
       FROM family_invitations invitation
       JOIN tenants tenant ON tenant.id = invitation.tenant_id
       LEFT JOIN app_user_identities identity ON identity.user_id = invitation.invited_by
       WHERE invitation.id = ?`,
    )
      .bind(invitationId)
      .first<InvitationDelivery>();
  },

  async revokeInvitation(env, tenantId, invitationId) {
    const result = await env.DB.prepare(
      "DELETE FROM family_invitations WHERE id = ? AND tenant_id = ?",
    )
      .bind(invitationId, tenantId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  },

  async invitationsFor(env, email) {
    const { results } = await env.DB.prepare(
      `SELECT invitation.id, invitation.tenant_id AS familyId, tenant.name AS familyName,
              invitation.role, identity.verified_email AS invitedBy,
              invitation.expires_at AS expiresAt
       FROM family_invitations invitation
       JOIN tenants tenant ON tenant.id = invitation.tenant_id
       LEFT JOIN app_user_identities identity ON identity.user_id = invitation.invited_by
       WHERE invitation.email = ? AND invitation.expires_at > ${NOW}
       ORDER BY invitation.created_at, invitation.id`,
    )
      .bind(email)
      .all<FamilyInvitation>();
    return results;
  },

  async invitationTenant(env, email, invitationId) {
    const row = await env.DB.prepare(
      `SELECT tenant_id AS tenantId FROM family_invitations
       WHERE id = ? AND email = ? AND ${LIVE_INVITATION}`,
    )
      .bind(invitationId, email)
      .first<{ tenantId: string }>();
    return row?.tenantId ?? null;
  },

  async hasRecentJoinElsewhere(env, userId, tenantId) {
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM family_seat_events
       WHERE user_id = ? AND kind = 'joined' AND tenant_id != ?
         AND created_at > ${daysAgo(FAMILY_JOIN_COOLDOWN_DAYS)}
       LIMIT 1`,
    )
      .bind(userId, tenantId)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async accept(env, userId, email, invitationId) {
    // The invitation already holds the seat, so accepting moves it to a member without a recount.
    const [joined] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenant_members (tenant_id, user_id, role)
         SELECT tenant_id, ?, role FROM family_invitations
         WHERE id = ? AND email = ? AND ${LIVE_INVITATION}`,
      ).bind(userId, invitationId, email),
      env.DB.prepare(
        `INSERT INTO family_seat_events (tenant_id, user_id, kind)
         SELECT tenant_id, user_id, 'joined' FROM tenant_members
         WHERE user_id = ? AND tenant_id = (SELECT tenant_id FROM family_invitations WHERE id = ?)
           AND changes() > 0`,
      ).bind(userId, invitationId),
      env.DB.prepare("DELETE FROM family_invitations WHERE id = ? AND email = ?").bind(
        invitationId,
        email,
      ),
    ]);
    return (joined!.meta.changes ?? 0) > 0;
  },

  async decline(env, email, invitationId) {
    const result = await env.DB.prepare("DELETE FROM family_invitations WHERE id = ? AND email = ?")
      .bind(invitationId, email)
      .run();
    return (result.meta.changes ?? 0) > 0;
  },

  async freeSeat(env, tenantId, userId) {
    const [removed] = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ? AND role != 'owner'",
      ).bind(tenantId, userId),
      env.DB.prepare(
        `INSERT INTO family_seat_events (tenant_id, user_id, kind)
         SELECT ?, ?, 'freed' WHERE changes() > 0`,
      ).bind(tenantId, userId),
    ]);
    return (removed!.meta.changes ?? 0) > 0;
  },

  async setRole(env, tenantId, userId, role) {
    const result = await env.DB.prepare(
      "UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ? AND role != 'owner'",
    )
      .bind(role, tenantId, userId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  },

  async transfer(env, tenantId, ownerId, newOwnerId) {
    // Two steps because the one-owner index is checked row by row: demote first, and only when
    // the new owner is already a member; then promote only once the family has no owner. If the
    // new owner already owns a family, their index rejects the promotion and the batch rolls back.
    const [, promoted] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE tenant_members SET role = 'member'
         WHERE tenant_id = ?1 AND user_id = ?2 AND role = 'owner'
           AND EXISTS (SELECT 1 FROM tenant_members
                       WHERE tenant_id = ?1 AND user_id = ?3 AND role != 'owner')`,
      ).bind(tenantId, ownerId, newOwnerId),
      env.DB.prepare(
        `UPDATE tenant_members SET role = 'owner'
         WHERE tenant_id = ?1 AND user_id = ?2
           AND NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = ?1 AND role = 'owner')`,
      ).bind(tenantId, newOwnerId),
    ]);
    return (promoted!.meta.changes ?? 0) > 0;
  },
};
