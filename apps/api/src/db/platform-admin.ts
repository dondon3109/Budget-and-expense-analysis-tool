import type { SponsoredProSeat, SponsoredProSeatSummary } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const SEAT_CAPACITY = 5 as const;
const INVITATION_COOLDOWN_SECONDS = 15 * 60;
const INVITATION_LEASE_SECONDS = 60;

interface SeatRow {
  slotNumber: number;
  state: "empty" | "pending" | "active";
  beneficiaryUserId: string | null;
  invitedAt: string | null;
  assignedAt: string | null;
  inviteLastSentAt: string | null;
}

interface InvitationDelivery extends SeatRow {
  pendingEmail: string;
  leaseToken: string;
}

function toSeat(row: SeatRow): SponsoredProSeat | null {
  if (row.state === "empty") return null;
  return {
    slotNumber: row.slotNumber,
    state: row.state,
    beneficiaryUserId: row.beneficiaryUserId,
    invitedAt: row.invitedAt,
    assignedAt: row.assignedAt,
    canResendInvitation:
      row.state === "pending" &&
      (!row.inviteLastSentAt ||
        new Date(row.inviteLastSentAt).getTime() <=
          Date.now() - INVITATION_COOLDOWN_SECONDS * 1_000),
  };
}

function databaseMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

function isUniqueBeneficiaryError(error: unknown): boolean {
  const message = databaseMessage(error);
  return (
    message.includes("sponsored_pro_seats_active_beneficiary_unique") ||
    message.includes("sponsored_pro_seats.beneficiary_user_id")
  );
}

function isUniquePendingEmailError(error: unknown): boolean {
  const message = databaseMessage(error);
  return (
    message.includes("sponsored_pro_seats_pending_email_unique") ||
    message.includes("sponsored_pro_seats.pending_email")
  );
}

export interface PlatformAdminRepository {
  isEnabledAdmin(env: Bindings, userId: string): Promise<boolean>;
  isPlatformAdminIdentity(env: Bindings, userId: string): Promise<boolean>;
  getSummary(env: Bindings, sponsorUserId: string): Promise<SponsoredProSeatSummary>;
  findVerifiedUserIdByEmail(env: Bindings, email: string): Promise<string | null>;
  syncVerifiedIdentity(env: Bindings, userId: string, verifiedEmail: string): Promise<void>;
  claimPendingSeat(env: Bindings, userId: string, verifiedEmail: string): Promise<void>;
  addKnownRecipient(
    env: Bindings,
    sponsorUserId: string,
    beneficiaryUserId: string,
  ): Promise<SponsoredProSeat>;
  createPendingInvitation(
    env: Bindings,
    sponsorUserId: string,
    email: string,
  ): Promise<SponsoredProSeat>;
  replaceSeat(
    env: Bindings,
    sponsorUserId: string,
    slotNumber: number,
    beneficiaryUserId: string,
  ): Promise<SponsoredProSeat>;
  revokeSeat(env: Bindings, sponsorUserId: string, slotNumber: number): Promise<void>;
  claimInvitationDelivery(
    env: Bindings,
    sponsorUserId: string,
    slotNumber: number,
  ): Promise<InvitationDelivery | null>;
  finishInvitationDelivery(
    env: Bindings,
    sponsorUserId: string,
    slotNumber: number,
    leaseToken: string,
    delivered: boolean,
  ): Promise<void>;
  releasePendingSeatsForPlatformAdmin(
    env: Bindings,
    userId: string,
    verifiedEmail: string,
  ): Promise<void>;
  releaseBeneficiarySeats(env: Bindings, userId: string): Promise<void>;
  isDeletedIdentity(env: Bindings, userId: string): Promise<boolean>;
}

async function enabled(env: Bindings, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS found FROM platform_admin_grants
     WHERE user_id = ? AND complimentary_pro_enabled = 1 LIMIT 1`,
  )
    .bind(userId)
    .first<{ found: number }>();
  return Boolean(row);
}

async function seatFailure(
  env: Bindings,
  sponsorUserId: string,
  beneficiaryUserId?: string,
): Promise<never> {
  if (!(await enabled(env, sponsorUserId))) {
    throw new HttpError(
      403,
      "platform_admin_required",
      "Platform administrator access is required.",
    );
  }
  if (beneficiaryUserId) {
    const duplicate = await env.DB.prepare(
      `SELECT 1 AS found FROM sponsored_pro_seats
       WHERE state = 'active' AND beneficiary_user_id = ? LIMIT 1`,
    )
      .bind(beneficiaryUserId)
      .first<{ found: number }>();
    if (duplicate) {
      throw new HttpError(
        409,
        "sponsored_seat_already_assigned",
        "This person already has a sponsored seat.",
      );
    }
  }
  throw new HttpError(
    409,
    "sponsored_seat_capacity_reached",
    "All five sponsored seats are in use.",
  );
}

export const platformAdminRepository: PlatformAdminRepository = {
  isEnabledAdmin: enabled,

  async isPlatformAdminIdentity(env, userId) {
    const row = await env.DB.prepare(
      "SELECT 1 AS found FROM platform_admin_grants WHERE user_id = ? LIMIT 1",
    )
      .bind(userId)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async getSummary(env, sponsorUserId) {
    const rows = await env.DB.prepare(
      `SELECT slot_number AS slotNumber, state, beneficiary_user_id AS beneficiaryUserId,
              invited_at AS invitedAt, assigned_at AS assignedAt,
              invite_last_sent_at AS inviteLastSentAt
       FROM sponsored_pro_seats
       WHERE sponsor_user_id = ? AND state != 'empty'
       ORDER BY slot_number`,
    )
      .bind(sponsorUserId)
      .all<SeatRow>();
    const seats = rows.results.flatMap((row) => {
      const seat = toSeat(row);
      return seat ? [seat] : [];
    });
    const activeCount = seats.filter((seat) => seat.state === "active").length;
    const pendingCount = seats.length - activeCount;
    return {
      capacity: SEAT_CAPACITY,
      activeCount,
      pendingCount,
      availableCount: SEAT_CAPACITY - seats.length,
      seats,
    };
  },

  async findVerifiedUserIdByEmail(env, email) {
    const row = await env.DB.prepare(
      "SELECT user_id AS userId FROM app_user_identities WHERE verified_email = ? LIMIT 1",
    )
      .bind(email)
      .first<{ userId: string }>();
    return row?.userId ?? null;
  },

  async syncVerifiedIdentity(env, userId, verifiedEmail) {
    await env.DB.prepare(
      `INSERT INTO app_user_identities (user_id, verified_email, verified_at, updated_at)
       SELECT ?, ?, datetime('now'), datetime('now')
       WHERE NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = ?)
       ON CONFLICT(user_id) DO UPDATE SET verified_email = excluded.verified_email,
         verified_at = datetime('now'), updated_at = datetime('now')`,
    )
      .bind(userId, verifiedEmail, userId)
      .run();
  },

  async claimPendingSeat(env, userId, verifiedEmail) {
    await env.DB.prepare(
      `UPDATE sponsored_pro_seats
       SET state = 'active', pending_email = NULL, beneficiary_user_id = ?,
           assigned_at = datetime('now'), invite_send_lease_until = NULL,
           invite_send_lease_token = NULL, updated_at = datetime('now')
       WHERE state = 'pending' AND pending_email = ?
         AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = ?)
         AND NOT EXISTS (SELECT 1 FROM platform_admin_grants WHERE user_id = ?)
         AND EXISTS (
           SELECT 1 FROM platform_admin_grants AS grant
           WHERE grant.user_id = sponsored_pro_seats.sponsor_user_id
             AND grant.complimentary_pro_enabled = 1
         )`,
    )
      .bind(userId, verifiedEmail, userId, userId)
      .run();
  },

  async addKnownRecipient(env, sponsorUserId, beneficiaryUserId) {
    try {
      const row = await env.DB.prepare(
        `UPDATE sponsored_pro_seats
         SET state = 'active', beneficiary_user_id = ?, pending_email = NULL,
             invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL, invite_send_lease_token = NULL,
             assigned_at = datetime('now'), updated_at = datetime('now')
         WHERE sponsor_user_id = ?
           AND slot_number = (
             SELECT slot_number FROM sponsored_pro_seats
             WHERE sponsor_user_id = ? AND state = 'empty'
             ORDER BY slot_number LIMIT 1
           )
           AND EXISTS (
             SELECT 1 FROM platform_admin_grants
             WHERE user_id = ? AND complimentary_pro_enabled = 1
           )
           AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = ?)
         RETURNING slot_number AS slotNumber, state, beneficiary_user_id AS beneficiaryUserId,
                   invited_at AS invitedAt, assigned_at AS assignedAt,
                   invite_last_sent_at AS inviteLastSentAt`,
      )
        .bind(beneficiaryUserId, sponsorUserId, sponsorUserId, sponsorUserId, beneficiaryUserId)
        .first<SeatRow>();
      if (!row) return seatFailure(env, sponsorUserId, beneficiaryUserId);
      return toSeat(row)!;
    } catch (error) {
      if (isUniqueBeneficiaryError(error)) {
        throw new HttpError(
          409,
          "sponsored_seat_already_assigned",
          "This person already has a sponsored seat.",
        );
      }
      throw error;
    }
  },

  async createPendingInvitation(env, sponsorUserId, email) {
    try {
      const row = await env.DB.prepare(
        `UPDATE sponsored_pro_seats
         SET state = 'pending', pending_email = ?, beneficiary_user_id = NULL,
             invited_at = datetime('now'), invite_last_sent_at = NULL,
             invite_send_lease_until = NULL, invite_send_lease_token = NULL,
             assigned_at = NULL, updated_at = datetime('now')
         WHERE sponsor_user_id = ?
           AND slot_number = (
             SELECT slot_number FROM sponsored_pro_seats
             WHERE sponsor_user_id = ? AND state = 'empty'
             ORDER BY slot_number LIMIT 1
           )
           AND EXISTS (
             SELECT 1 FROM platform_admin_grants
             WHERE user_id = ? AND complimentary_pro_enabled = 1
           )
         RETURNING slot_number AS slotNumber, state, beneficiary_user_id AS beneficiaryUserId,
                   invited_at AS invitedAt, assigned_at AS assignedAt,
                   invite_last_sent_at AS inviteLastSentAt`,
      )
        .bind(email, sponsorUserId, sponsorUserId, sponsorUserId)
        .first<SeatRow>();
      if (!row) return seatFailure(env, sponsorUserId);
      return toSeat(row)!;
    } catch (error) {
      if (isUniquePendingEmailError(error)) {
        throw new HttpError(
          409,
          "sponsored_invitation_already_pending",
          "An invitation is already pending for this email.",
        );
      }
      throw error;
    }
  },

  async replaceSeat(env, sponsorUserId, slotNumber, beneficiaryUserId) {
    try {
      const row = await env.DB.prepare(
        `UPDATE sponsored_pro_seats
         SET state = 'active', beneficiary_user_id = ?, pending_email = NULL,
             invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL, invite_send_lease_token = NULL,
             assigned_at = datetime('now'), updated_at = datetime('now')
         WHERE sponsor_user_id = ? AND slot_number = ? AND state != 'empty'
           AND EXISTS (
             SELECT 1 FROM platform_admin_grants
             WHERE user_id = ? AND complimentary_pro_enabled = 1
           )
           AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = ?)
         RETURNING slot_number AS slotNumber, state, beneficiary_user_id AS beneficiaryUserId,
                   invited_at AS invitedAt, assigned_at AS assignedAt,
                   invite_last_sent_at AS inviteLastSentAt`,
      )
        .bind(beneficiaryUserId, sponsorUserId, slotNumber, sponsorUserId, beneficiaryUserId)
        .first<SeatRow>();
      if (!row) {
        if (!(await enabled(env, sponsorUserId))) {
          throw new HttpError(
            403,
            "platform_admin_required",
            "Platform administrator access is required.",
          );
        }
        throw new HttpError(404, "sponsored_seat_not_found", "This sponsored seat is not in use.");
      }
      return toSeat(row)!;
    } catch (error) {
      if (isUniqueBeneficiaryError(error)) {
        throw new HttpError(
          409,
          "sponsored_seat_already_assigned",
          "This person already has a sponsored seat.",
        );
      }
      throw error;
    }
  },

  async revokeSeat(env, sponsorUserId, slotNumber) {
    const result = await env.DB.prepare(
      `UPDATE sponsored_pro_seats
       SET state = 'empty', pending_email = NULL, beneficiary_user_id = NULL,
           invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL,
           invite_send_lease_token = NULL, assigned_at = NULL, updated_at = datetime('now')
       WHERE sponsor_user_id = ? AND slot_number = ? AND state != 'empty'
         AND EXISTS (
           SELECT 1 FROM platform_admin_grants
           WHERE user_id = ? AND complimentary_pro_enabled = 1
         )`,
    )
      .bind(sponsorUserId, slotNumber, sponsorUserId)
      .run();
    if ((result.meta.changes ?? 0) === 1) return;
    if (!(await enabled(env, sponsorUserId))) {
      throw new HttpError(
        403,
        "platform_admin_required",
        "Platform administrator access is required.",
      );
    }
    throw new HttpError(404, "sponsored_seat_not_found", "This sponsored seat is not in use.");
  },

  async claimInvitationDelivery(env, sponsorUserId, slotNumber) {
    const leaseUntil = new Date(Date.now() + INVITATION_LEASE_SECONDS * 1_000).toISOString();
    const leaseToken = crypto.randomUUID();
    const row = await env.DB.prepare(
      `UPDATE sponsored_pro_seats
       SET invite_send_lease_until = ?, invite_send_lease_token = ?, updated_at = datetime('now')
       WHERE sponsor_user_id = ? AND slot_number = ? AND state = 'pending'
         AND (invite_send_lease_until IS NULL OR datetime(invite_send_lease_until) < datetime('now'))
         AND (invite_last_sent_at IS NULL OR datetime(invite_last_sent_at) <= datetime('now', '-15 minutes'))
         AND EXISTS (
           SELECT 1 FROM platform_admin_grants
           WHERE user_id = ? AND complimentary_pro_enabled = 1
         )
       RETURNING slot_number AS slotNumber, state, pending_email AS pendingEmail,
                 beneficiary_user_id AS beneficiaryUserId, invited_at AS invitedAt,
                 assigned_at AS assignedAt, invite_last_sent_at AS inviteLastSentAt,
                 invite_send_lease_token AS leaseToken`,
    )
      .bind(leaseUntil, leaseToken, sponsorUserId, slotNumber, sponsorUserId)
      .first<InvitationDelivery>();
    return row ?? null;
  },

  async finishInvitationDelivery(env, sponsorUserId, slotNumber, leaseToken, delivered) {
    await env.DB.prepare(
      `UPDATE sponsored_pro_seats
       SET invite_send_lease_until = NULL, invite_send_lease_token = NULL,
           invite_last_sent_at = CASE WHEN ? = 1 THEN datetime('now') ELSE invite_last_sent_at END,
           updated_at = datetime('now')
       WHERE sponsor_user_id = ? AND slot_number = ? AND state = 'pending'
         AND invite_send_lease_token = ?`,
    )
      .bind(delivered ? 1 : 0, sponsorUserId, slotNumber, leaseToken)
      .run();
  },

  async releasePendingSeatsForPlatformAdmin(env, userId, verifiedEmail) {
    await env.DB.prepare(
      `UPDATE sponsored_pro_seats
       SET state = 'empty', pending_email = NULL, beneficiary_user_id = NULL,
           invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL,
           invite_send_lease_token = NULL, assigned_at = NULL, updated_at = datetime('now')
       WHERE state = 'pending' AND pending_email = ?
         AND EXISTS (SELECT 1 FROM platform_admin_grants WHERE user_id = ?)`,
    )
      .bind(verifiedEmail, userId)
      .run();
  },

  async releaseBeneficiarySeats(env, userId) {
    await env.DB.prepare(
      `UPDATE sponsored_pro_seats
       SET state = 'empty', pending_email = NULL, beneficiary_user_id = NULL,
           invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL,
           invite_send_lease_token = NULL, assigned_at = NULL, updated_at = datetime('now')
       WHERE state = 'active' AND beneficiary_user_id = ?`,
    )
      .bind(userId)
      .run();
  },

  async isDeletedIdentity(env, userId) {
    const row = await env.DB.prepare(
      "SELECT 1 AS found FROM account_deletions WHERE user_id = ? LIMIT 1",
    )
      .bind(userId)
      .first<{ found: number }>();
    return Boolean(row);
  },
};
