import {
  FAMILY_MEMBERSHIP_LIMIT,
  type FamilyClosure,
  type FamilyDetail,
  type FamilyInvitationList,
  type FamilyInviteInput,
  type FamilyMemberRole,
  type WorkspaceSummary,
} from "@zoption/shared";

import { escapeHtml } from "./account-email";
import { cancelProviderSubscription } from "./billing/checkout";
import { billingRepository, type BillingRepository } from "./db/billing";
import { familyRepository, type FamilyRepository } from "./db/families";
import { HttpError } from "./errors";
import { configuredAppUrl, configuredSender } from "./platform-admin";
import { createResendSender } from "./resend";
import type { AuthUser, Bindings, EmailSender, TenantContext } from "./types";

/**
 * Family workspace management. Owner actions run in the family the request names through the
 * workspace header (`tenant`); invitation and leave actions run as the signed-in person, so a
 * viewer can still leave and an invitee who is not yet a member can answer an invitation.
 */
export interface FamilyService {
  create(env: Bindings, user: AuthUser, name: string): Promise<WorkspaceSummary>;
  detail(env: Bindings, tenant: TenantContext): Promise<FamilyDetail>;
  invite(
    env: Bindings,
    tenant: TenantContext,
    user: AuthUser,
    input: FamilyInviteInput,
  ): Promise<void>;
  resend(env: Bindings, tenant: TenantContext, invitationId: string): Promise<void>;
  revoke(env: Bindings, tenant: TenantContext, invitationId: string): Promise<void>;
  setRole(
    env: Bindings,
    tenant: TenantContext,
    userId: string,
    role: FamilyMemberRole,
  ): Promise<void>;
  remove(env: Bindings, tenant: TenantContext, user: AuthUser, userId: string): Promise<void>;
  transfer(env: Bindings, tenant: TenantContext, user: AuthUser, userId: string): Promise<void>;
  close(env: Bindings, tenant: TenantContext, user: AuthUser): Promise<FamilyClosure>;
  invitations(env: Bindings, user: AuthUser): Promise<FamilyInvitationList>;
  accept(env: Bindings, user: AuthUser, invitationId: string): Promise<void>;
  decline(env: Bindings, user: AuthUser, invitationId: string): Promise<void>;
  leave(env: Bindings, user: AuthUser, familyId: string): Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

/** Owner actions need the request to act in a family the caller owns. */
function requireOwner(tenant: TenantContext): void {
  if (!tenant.membership) {
    throw new HttpError(400, "family_required", "Open a family workspace first.");
  }
  if (tenant.membership.role !== "owner") {
    throw new HttpError(403, "family_owner_required", "Only the family owner can do this.");
  }
}

/** Invitations open once a plan covers the family; an unpaid family is its owner's alone. */
function familyPlanRequiredError(): HttpError {
  return new HttpError(
    403,
    "family_plan_required",
    "Choose a family plan before inviting anyone.",
    { billingPath: "/app/family" },
  );
}

export function createFamilyService(
  repository: FamilyRepository = familyRepository,
  injectedSender?: EmailSender,
  billing: BillingRepository = billingRepository,
): FamilyService {
  /**
   * Stops the family plan renewing when its owner hands it over or closes it. The paid period
   * still runs out, and the new owner buys their own plan to keep the family going.
   */
  async function stopFamilyRenewals(env: Bindings, familyTenantId: string): Promise<void> {
    for (const subscription of await billing.listFamilySubscriptions(env, familyTenantId)) {
      await cancelProviderSubscription(env, subscription);
    }
  }

  async function requireVerifiedEmail(env: Bindings, user: AuthUser): Promise<string> {
    const email = await repository.verifiedEmail(env, user.id);
    if (!email) {
      throw new HttpError(409, "email_unverified", "Confirm your email before joining a family.");
    }
    return email;
  }

  async function deliver(env: Bindings, tenantId: string, invitationId: string): Promise<void> {
    const delivery = await repository.claimDelivery(env, tenantId, invitationId);
    if (!delivery) {
      throw new HttpError(409, "invitation_cooldown", "Wait a minute before sending it again.");
    }
    const apiKey = env.RESEND_API_KEY?.trim();
    const sender = injectedSender ?? (apiKey ? createResendSender(apiKey) : null);
    if (!sender) {
      throw new HttpError(
        503,
        "email_invitation_unavailable",
        "Email invitations are not configured.",
      );
    }
    const loginUrl = new URL("/login?redirectTo=%2Fapp", configuredAppUrl(env)).href;
    const family = delivery.familyName;
    const inviter = delivery.inviterEmail ?? "A Zoption user";
    await sender.send({
      to: delivery.email,
      from: configuredSender(env),
      subject: `You're invited to the ${family} family on Zoption`,
      text: `${inviter} invited you to share the ${family} family budget on Zoption. Sign in with this email address and open Zoption to accept.\n\nSign in: ${loginUrl}`,
      html: `<p>${escapeHtml(inviter)} invited you to share the <strong>${escapeHtml(family)}</strong> family budget on Zoption.</p><p>Sign in with this email address and open Zoption to accept.</p><p><a href="${loginUrl}">Sign in</a></p>`,
    });
  }

  return {
    async create(env, user, name) {
      if (env.FAMILY_WORKSPACES_ENABLED !== "true") {
        throw new HttpError(403, "family_unavailable", "Family workspaces are not available yet.");
      }
      if (await repository.ownedFamilyId(env, user.id)) {
        throw new HttpError(409, "family_already_owned", "You already own a family.");
      }
      if ((await repository.membershipCount(env, user.id)) >= FAMILY_MEMBERSHIP_LIMIT) {
        throw new HttpError(
          409,
          "family_membership_limit",
          "You are in as many families as allowed.",
        );
      }
      try {
        const id = await repository.create(env, user.id, name);
        return { id, kind: "family", name, role: "owner" };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, "family_already_owned", "You already own a family.");
        }
        throw error;
      }
    },

    async detail(env, tenant) {
      if (!tenant.membership) {
        throw new HttpError(400, "family_required", "Open a family workspace first.");
      }
      const detail = await repository.detail(env, tenant.tenantId, tenant.membership.role);
      return { ...detail, plan: tenant.membership.plan };
    },

    async invite(env, tenant, user, input) {
      requireOwner(tenant);
      if (tenant.membership!.plan !== "active") throw familyPlanRequiredError();
      const family = await repository.detail(env, tenant.tenantId, "owner");
      if (family.members.some((member) => member.email?.toLowerCase() === input.email)) {
        throw new HttpError(409, "already_member", "This person is already in the family.");
      }
      let invitationId: string | null;
      try {
        invitationId = await repository.invite(
          env,
          tenant.tenantId,
          input.email,
          input.role,
          user.id,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, "already_invited", "This email already has an invitation.");
        }
        throw error;
      }
      if (!invitationId) {
        if (family.swaps.used >= family.swaps.limit) {
          throw new HttpError(
            409,
            "family_swap_limit",
            "This family has used its seat changes for the year.",
          );
        }
        throw new HttpError(
          409,
          "family_seats_full",
          "Every seat in this family is taken or cooling down.",
        );
      }
      await deliver(env, tenant.tenantId, invitationId);
    },

    async resend(env, tenant, invitationId) {
      requireOwner(tenant);
      if (tenant.membership!.plan !== "active") throw familyPlanRequiredError();
      await deliver(env, tenant.tenantId, invitationId);
    },

    async revoke(env, tenant, invitationId) {
      requireOwner(tenant);
      if (!(await repository.revokeInvitation(env, tenant.tenantId, invitationId))) {
        throw new HttpError(404, "invitation_not_found", "This invitation no longer exists.");
      }
    },

    async setRole(env, tenant, userId, role) {
      requireOwner(tenant);
      if (!(await repository.setRole(env, tenant.tenantId, userId, role))) {
        throw new HttpError(404, "member_not_found", "This person is not a member you can change.");
      }
    },

    async remove(env, tenant, user, userId) {
      requireOwner(tenant);
      if (userId === user.id) {
        throw new HttpError(409, "owner_cannot_leave", "Transfer the family before leaving it.");
      }
      if (!(await repository.freeSeat(env, tenant.tenantId, userId))) {
        throw new HttpError(404, "member_not_found", "This person is not a member you can remove.");
      }
    },

    async transfer(env, tenant, user, userId) {
      requireOwner(tenant);
      if (userId === user.id) {
        throw new HttpError(400, "invalid_transfer", "Choose another member to own the family.");
      }
      // Checked before the plan stops renewing, so a transfer that cannot happen leaves it alone.
      if ((await repository.memberRole(env, tenant.tenantId, userId)) === null) {
        throw new HttpError(404, "member_not_found", "Only a current member can own the family.");
      }
      if (await repository.ownedFamilyId(env, userId)) {
        throw new HttpError(409, "new_owner_owns_family", "This person already owns a family.");
      }
      await stopFamilyRenewals(env, tenant.tenantId);
      let moved: boolean;
      try {
        moved = await repository.transfer(env, tenant.tenantId, user.id, userId);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, "new_owner_owns_family", "This person already owns a family.");
        }
        throw error;
      }
      if (!moved) {
        throw new HttpError(404, "member_not_found", "Only a current member can own the family.");
      }
    },

    async close(env, tenant, user) {
      requireOwner(tenant);
      await stopFamilyRenewals(env, tenant.tenantId);
      return { closesAt: await repository.close(env, tenant.tenantId, user.id) };
    },

    async invitations(env, user) {
      const email = await repository.verifiedEmail(env, user.id);
      return { invitations: email ? await repository.invitationsFor(env, email) : [] };
    },

    async accept(env, user, invitationId) {
      const email = await requireVerifiedEmail(env, user);
      const tenantId = await repository.invitationTenant(env, email, invitationId);
      if (!tenantId) {
        throw new HttpError(404, "invitation_not_found", "This invitation is no longer open.");
      }
      if (await repository.memberRole(env, tenantId, user.id)) {
        throw new HttpError(409, "already_member", "You are already in this family.");
      }
      if ((await billing.familyPlanState(env, tenantId)) !== "active") {
        throw new HttpError(
          409,
          "family_plan_inactive",
          "This family has no active plan. Ask its owner to renew it.",
        );
      }
      if (await repository.hasRecentJoinElsewhere(env, user.id, tenantId)) {
        throw new HttpError(
          409,
          "family_join_cooldown",
          "You joined another family recently. Try again later.",
        );
      }
      if ((await repository.membershipCount(env, user.id)) >= FAMILY_MEMBERSHIP_LIMIT) {
        throw new HttpError(
          409,
          "family_membership_limit",
          "You are in as many families as allowed.",
        );
      }
      if (!(await repository.accept(env, user.id, email, invitationId))) {
        throw new HttpError(404, "invitation_not_found", "This invitation is no longer open.");
      }
    },

    async decline(env, user, invitationId) {
      const email = await requireVerifiedEmail(env, user);
      if (!(await repository.decline(env, email, invitationId))) {
        throw new HttpError(404, "invitation_not_found", "This invitation is no longer open.");
      }
    },

    async leave(env, user, familyId) {
      const role = await repository.memberRole(env, familyId, user.id);
      if (!role) throw new HttpError(404, "family_not_found", "You are not in this family.");
      if (role === "owner") {
        throw new HttpError(409, "owner_cannot_leave", "Transfer the family before leaving it.");
      }
      await repository.freeSeat(env, familyId, user.id);
    },
  };
}

export const familyService = createFamilyService();
