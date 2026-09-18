import type { Bindings } from "../types";

/** A voice ticket is only useful for the connect it was minted for. */
export const VOICE_TICKET_TTL_SECONDS = 60;

export interface VoiceTicket {
  ticket: string;
  expiresAt: string;
}

export interface VoiceTicketRepository {
  mint(env: Bindings, userId: string, ttlSeconds: number): Promise<VoiceTicket>;
  /** Returns the ticket's user id, or null when it is unknown, expired or already redeemed. */
  consume(env: Bindings, ticket: string): Promise<string | null>;
}

export const voiceTicketRepository: VoiceTicketRepository = {
  async mint(env, userId, ttlSeconds) {
    // Nothing sweeps this table on a schedule, so drop spent rows while we are here.
    const now = new Date();
    await env.DB.prepare("DELETE FROM assistant_voice_tickets WHERE expires_at <= ?")
      .bind(now.toISOString())
      .run();

    const ticket = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO assistant_voice_tickets (ticket, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(ticket, userId, now.toISOString(), expiresAt)
      .run();
    return { ticket, expiresAt };
  },

  async consume(env, ticket) {
    // One statement deletes and returns, so two concurrent connects cannot both redeem a ticket.
    const row = await env.DB.prepare(
      "DELETE FROM assistant_voice_tickets WHERE ticket = ? AND expires_at > ? RETURNING user_id AS userId",
    )
      .bind(ticket, new Date().toISOString())
      .first<{ userId: string }>();
    return row?.userId ?? null;
  },
};
