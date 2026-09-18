import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPlatformAdminService,
  createVerifiedIdentityGateway,
  normalizeEmail,
} from "../src/platform-admin";
import { platformAdminRepository, type PlatformAdminRepository } from "../src/db/platform-admin";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const env = {
  DB: {} as D1Database,
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key",
} satisfies Bindings;

const databases: Array<{ close(): void }> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function identityEnvironment(): {
  env: Bindings;
  database: ReturnType<typeof createD1TestDatabase>["database"];
} {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  return { env: { DB: binding }, database };
}

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
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const service = createPlatformAdminService(repository, undefined, email);
    const emailEnv = {
      ...env,
      WEB_APP_URL: "https://zoption.site",
      EMAIL_FROM: "hello@zoption.site",
    } satisfies Bindings;

    await service.resendInvitation(emailEnv, "admin-id", 1);

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.com",
        from: { email: "hello@zoption.site", name: "Zoption" },
        subject: "You have been invited to sponsored Zoption Pro access",
      }),
    );
    expect(repository.finishInvitationDelivery).toHaveBeenCalledWith(
      emailEnv,
      "admin-id",
      1,
      "lease-token",
      true,
    );
  });
});

describe("platform-admin verified identity storage", () => {
  it("releases a stale row that owns the same email under another user id", async () => {
    const { env, database } = identityEnvironment();
    database.exec(
      "INSERT INTO app_user_identities (user_id, verified_email) VALUES ('previous-user', 'person@example.com')",
    );

    // Before the fix this insert violated app_user_identities_verified_email_unique and threw.
    await expect(
      platformAdminRepository.syncVerifiedIdentity(env, "current-user", "person@example.com"),
    ).resolves.toBeUndefined();

    expect(
      database
        .prepare("SELECT user_id AS userId FROM app_user_identities WHERE verified_email = ?")
        .all("person@example.com"),
    ).toEqual([{ userId: "current-user" }]);
  });

  it("keeps refusing to record an identity for a deleted account", async () => {
    const { env, database } = identityEnvironment();
    database.exec("INSERT INTO account_deletions (user_id) VALUES ('deleted-user')");

    await expect(
      platformAdminRepository.syncVerifiedIdentity(env, "deleted-user", "gone@example.com"),
    ).resolves.toBeUndefined();

    expect(database.prepare("SELECT count(*) AS count FROM app_user_identities").get()).toEqual({
      count: 0,
    });
  });
});
