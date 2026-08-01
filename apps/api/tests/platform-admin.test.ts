import { describe, expect, it, vi } from "vitest";

import {
  createPlatformAdminService,
  createVerifiedIdentityGateway,
  normalizeEmail,
} from "../src/platform-admin";
import { platformAdminRepository, type PlatformAdminRepository } from "../src/db/platform-admin";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key",
} satisfies Bindings;

function repositoryMock(overrides: Partial<PlatformAdminRepository> = {}): PlatformAdminRepository {
  return {
    isEnabledAdmin: vi.fn(),
    isPlatformAdminIdentity: vi.fn(),
    getSummary: vi.fn(),
    findVerifiedUserIdByEmail: vi.fn(),
    syncVerifiedIdentity: vi.fn(),
    claimPendingSeat: vi.fn(),
    addKnownRecipient: vi.fn(),
    createPendingInvitation: vi.fn(),
    replaceSeat: vi.fn(),
    revokeSeat: vi.fn(),
    claimInvitationDelivery: vi.fn(),
    finishInvitationDelivery: vi.fn(),
    releasePendingSeatsForPlatformAdmin: vi.fn(),
    releaseBeneficiarySeats: vi.fn(),
    isDeletedIdentity: vi.fn(),
    ...overrides,
  };
}

function uniqueViolationEnvironment(column: "beneficiary_user_id" | "pending_email"): Bindings {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            throw new Error(`UNIQUE constraint failed: sponsored_pro_seats.${column}`);
          }),
        })),
      })),
    } as unknown as D1Database,
  };
}

describe("platform-admin identity verification", () => {
  it("normalizes recipient lookup email consistently", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });

  it("accepts only the current authenticated user's confirmed email", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        id: "08060c19-8a55-4046-a2e7-7384808dd81c",
        email: "Admin@Example.com",
        email_confirmed_at: "2026-08-01T00:00:00.000Z",
      }),
    );
    const gateway = createVerifiedIdentityGateway(fetcher);

    await expect(gateway.getVerifiedIdentity(env, "access-token")).resolves.toEqual({
      id: "08060c19-8a55-4046-a2e7-7384808dd81c",
      email: "admin@example.com",
    });
    expect(fetcher).toHaveBeenCalledWith("https://project.supabase.co/auth/v1/user", {
      headers: { apikey: "publishable-key", Authorization: "Bearer access-token" },
    });
  });

  it("rejects an unconfirmed email before it can enter the recipient directory", async () => {
    const gateway = createVerifiedIdentityGateway(async () =>
      Response.json({
        id: "08060c19-8a55-4046-a2e7-7384808dd81c",
        email: "person@example.com",
        email_confirmed_at: null,
      }),
    );

    await expect(gateway.getVerifiedIdentity(env, "access-token")).rejects.toMatchObject({
      code: "verified_email_required",
    });
  });
});

describe("platform-admin sponsored-seat safety", () => {
  it("maps SQLite partial-index violations to recipient conflict responses", async () => {
    await expect(
      platformAdminRepository.addKnownRecipient(
        uniqueViolationEnvironment("beneficiary_user_id"),
        "admin-id",
        "recipient-id",
      ),
    ).rejects.toMatchObject({ code: "sponsored_seat_already_assigned", status: 409 });

    await expect(
      platformAdminRepository.createPendingInvitation(
        uniqueViolationEnvironment("pending_email"),
        "admin-id",
        "recipient@example.com",
      ),
    ).rejects.toMatchObject({ code: "sponsored_invitation_already_pending", status: 409 });
  });

  it("clears a platform administrator's matching pending invitation instead of claiming it", async () => {
    const repository = repositoryMock({
      isPlatformAdminIdentity: vi.fn().mockResolvedValue(true),
    });
    const service = createPlatformAdminService(repository, {
      getVerifiedIdentity: vi.fn().mockResolvedValue({
        id: "admin-id",
        email: "admin@example.com",
      }),
    });

    await service.syncIdentity(env, { id: "admin-id" }, "access-token");

    expect(repository.syncVerifiedIdentity).toHaveBeenCalledWith(
      env,
      "admin-id",
      "admin@example.com",
    );
    expect(repository.releasePendingSeatsForPlatformAdmin).toHaveBeenCalledWith(
      env,
      "admin-id",
      "admin@example.com",
    );
    expect(repository.claimPendingSeat).not.toHaveBeenCalled();
  });

  it("finishes invitation delivery with the lease that claimed it", async () => {
    const repository = repositoryMock({
      isEnabledAdmin: vi.fn().mockResolvedValue(true),
      claimInvitationDelivery: vi.fn().mockResolvedValue({
        slotNumber: 1,
        state: "pending",
        pendingEmail: "recipient@example.com",
        beneficiaryUserId: null,
        invitedAt: "2026-08-01T00:00:00.000Z",
        assignedAt: null,
        inviteLastSentAt: null,
        leaseToken: "lease-token",
      }),
    });
    const service = createPlatformAdminService(repository);
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const emailEnv = {
      ...env,
      EMAIL: email,
      WEB_APP_URL: "https://zoption.site",
      EMAIL_FROM: "hello@zoption.site",
    } satisfies Bindings;

    await service.resendInvitation(emailEnv, "admin-id", 1);

    expect(repository.finishInvitationDelivery).toHaveBeenCalledWith(
      emailEnv,
      "admin-id",
      1,
      "lease-token",
      true,
    );
  });
});
