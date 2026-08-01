import type { SponsoredProSeat, SponsoredProSeatSummary } from "@zoption/shared";

import type { PlatformAdminRepository } from "./db/platform-admin";
import { platformAdminRepository } from "./db/platform-admin";
import { HttpError } from "./errors";
import type { AuthUser, Bindings } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function configuredSupabaseUrl(env: Bindings): string {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!url)
    throw new HttpError(
      503,
      "identity_verification_unavailable",
      "Identity verification is unavailable.",
    );
  return url;
}

function requiredPublishableKey(env: Bindings): string {
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key)
    throw new HttpError(
      503,
      "identity_verification_unavailable",
      "Identity verification is unavailable.",
    );
  return key;
}

function configuredAppUrl(env: Bindings): URL {
  const value = env.WEB_APP_URL?.trim();
  if (!value)
    throw new HttpError(
      503,
      "email_invitation_unavailable",
      "Email invitations are not configured.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(
      503,
      "email_invitation_unavailable",
      "Email invitations are not configured.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new HttpError(
      503,
      "email_invitation_unavailable",
      "Email invitations are not configured.",
    );
  }
  return url;
}

function configuredSender(env: Bindings): { email: string; name: string } {
  const email = env.EMAIL_FROM?.trim();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(
      503,
      "email_invitation_unavailable",
      "Email invitations are not configured.",
    );
  }
  return { email, name: "Zoption" };
}

export interface VerifiedIdentityGateway {
  getVerifiedIdentity(env: Bindings, accessToken: string): Promise<{ id: string; email: string }>;
}

export function createVerifiedIdentityGateway(
  fetcher: typeof fetch = fetch,
): VerifiedIdentityGateway {
  return {
    async getVerifiedIdentity(env, accessToken) {
      const response = await fetcher(`${configuredSupabaseUrl(env)}/auth/v1/user`, {
        headers: {
          apikey: requiredPublishableKey(env),
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new HttpError(
          503,
          "identity_verification_unavailable",
          "Identity verification is unavailable.",
        );
      }
      const payload: unknown = await response.json().catch(() => null);
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("id" in payload) ||
        !("email" in payload) ||
        !("email_confirmed_at" in payload) ||
        typeof payload.id !== "string" ||
        typeof payload.email !== "string" ||
        typeof payload.email_confirmed_at !== "string" ||
        !EMAIL_PATTERN.test(payload.email)
      ) {
        throw new HttpError(
          403,
          "verified_email_required",
          "Confirm your email before using sponsored access.",
        );
      }
      return { id: payload.id, email: normalizeEmail(payload.email) };
    },
  };
}

export interface PlatformAdminService {
  requireAdmin(env: Bindings, userId: string): Promise<void>;
  listSeats(env: Bindings, userId: string): Promise<SponsoredProSeatSummary>;
  addRecipient(env: Bindings, sponsorUserId: string, email: string): Promise<SponsoredProSeat>;
  createInvitation(env: Bindings, sponsorUserId: string, email: string): Promise<SponsoredProSeat>;
  resendInvitation(env: Bindings, sponsorUserId: string, slotNumber: number): Promise<void>;
  replaceSeat(
    env: Bindings,
    sponsorUserId: string,
    slotNumber: number,
    email: string,
  ): Promise<SponsoredProSeat>;
  revokeSeat(env: Bindings, sponsorUserId: string, slotNumber: number): Promise<void>;
  syncIdentity(env: Bindings, user: AuthUser, accessToken: string): Promise<void>;
  isPlatformAdminIdentity(env: Bindings, userId: string): Promise<boolean>;
}

export function createPlatformAdminService(
  repository: PlatformAdminRepository = platformAdminRepository,
  identityGateway: VerifiedIdentityGateway = createVerifiedIdentityGateway(),
): PlatformAdminService {
  async function recipientId(env: Bindings, sponsorUserId: string, email: string): Promise<string> {
    const normalized = normalizeEmail(email);
    const userId = await repository.findVerifiedUserIdByEmail(env, normalized);
    if (!userId) {
      throw new HttpError(
        409,
        "recipient_must_sign_in",
        "This person must sign in and confirm their email before receiving a sponsored seat.",
      );
    }
    if (userId === sponsorUserId || (await repository.isPlatformAdminIdentity(env, userId))) {
      throw new HttpError(
        409,
        "sponsored_recipient_forbidden",
        "This account cannot receive a sponsored seat.",
      );
    }
    if (await repository.isDeletedIdentity(env, userId)) {
      throw new HttpError(409, "recipient_account_deleted", "This account is no longer available.");
    }
    return userId;
  }

  async function sendInvitation(
    env: Bindings,
    sponsorUserId: string,
    slotNumber: number,
  ): Promise<void> {
    const delivery = await repository.claimInvitationDelivery(env, sponsorUserId, slotNumber);
    if (!delivery) {
      throw new HttpError(409, "invitation_cooldown", "Wait before sending another invitation.");
    }
    try {
      const sender = env.EMAIL;
      if (!sender) {
        throw new HttpError(
          503,
          "email_invitation_unavailable",
          "Email invitations are not configured.",
        );
      }
      const appUrl = configuredAppUrl(env);
      const signupUrl = new URL("/signup", appUrl).href;
      const loginUrl = new URL("/login?redirectTo=%2Fapp", appUrl).href;
      await sender.send({
        to: delivery.pendingEmail,
        from: configuredSender(env),
        subject: "You have been invited to sponsored Zoption Pro access",
        text: `You have been invited to receive sponsored Zoption Pro access. Create an account or sign in, confirm your email, and open Zoption to activate access.\n\nCreate an account: ${signupUrl}\nSign in: ${loginUrl}`,
        html: `<p>You have been invited to receive sponsored <strong>Zoption Pro</strong> access.</p><p>Create an account or sign in, confirm your email, and open Zoption to activate access.</p><p><a href="${signupUrl}">Create an account</a> or <a href="${loginUrl}">sign in</a>.</p>`,
      });
      await repository.finishInvitationDelivery(
        env,
        sponsorUserId,
        slotNumber,
        delivery.leaseToken,
        true,
      );
    } catch (error) {
      await repository.finishInvitationDelivery(
        env,
        sponsorUserId,
        slotNumber,
        delivery.leaseToken,
        false,
      );
      throw error;
    }
  }

  return {
    async requireAdmin(env, userId) {
      if (await repository.isEnabledAdmin(env, userId)) return;
      throw new HttpError(
        403,
        "platform_admin_required",
        "Platform administrator access is required.",
      );
    },

    async listSeats(env, userId) {
      await this.requireAdmin(env, userId);
      return repository.getSummary(env, userId);
    },

    async addRecipient(env, sponsorUserId, email) {
      await this.requireAdmin(env, sponsorUserId);
      return repository.addKnownRecipient(
        env,
        sponsorUserId,
        await recipientId(env, sponsorUserId, email),
      );
    },

    async createInvitation(env, sponsorUserId, email) {
      await this.requireAdmin(env, sponsorUserId);
      const normalized = normalizeEmail(email);
      if (await repository.findVerifiedUserIdByEmail(env, normalized)) {
        throw new HttpError(
          409,
          "recipient_already_eligible",
          "This person can be added to a sponsored seat now.",
        );
      }
      const seat = await repository.createPendingInvitation(env, sponsorUserId, normalized);
      await sendInvitation(env, sponsorUserId, seat.slotNumber);
      return seat;
    },

    async resendInvitation(env, sponsorUserId, slotNumber) {
      await this.requireAdmin(env, sponsorUserId);
      await sendInvitation(env, sponsorUserId, slotNumber);
    },

    async replaceSeat(env, sponsorUserId, slotNumber, email) {
      await this.requireAdmin(env, sponsorUserId);
      return repository.replaceSeat(
        env,
        sponsorUserId,
        slotNumber,
        await recipientId(env, sponsorUserId, email),
      );
    },

    async revokeSeat(env, sponsorUserId, slotNumber) {
      await this.requireAdmin(env, sponsorUserId);
      await repository.revokeSeat(env, sponsorUserId, slotNumber);
    },

    async syncIdentity(env, user, accessToken) {
      const identity = await identityGateway.getVerifiedIdentity(env, accessToken);
      if (identity.id !== user.id) {
        throw new HttpError(401, "invalid_access_token", "Sign in again before continuing.");
      }
      await repository.syncVerifiedIdentity(env, user.id, identity.email);
      if (await repository.isPlatformAdminIdentity(env, user.id)) {
        await repository.releasePendingSeatsForPlatformAdmin(env, user.id, identity.email);
        return;
      }
      await repository.claimPendingSeat(env, user.id, identity.email);
    },

    isPlatformAdminIdentity: repository.isPlatformAdminIdentity.bind(repository),
  };
}
