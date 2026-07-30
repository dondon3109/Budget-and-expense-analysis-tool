import { describe, expect, it, vi } from "vitest";

import {
  createAccountDeletionService,
  type SupabaseDeletionGateway,
} from "../src/account-deletion";
import type { AccountDeletionRecord, AccountDeletionRepository } from "../src/db/account-deletion";
import type { BillingRepository } from "../src/db/billing";
import type { Bindings } from "../src/types";

const USER = { id: "user-1", email: "person@example.com", role: "authenticated" } as const;
const TENANT_ID = "user:user-1";
const ENV = {} as Bindings;

function record(overrides: Partial<AccountDeletionRecord> = {}): AccountDeletionRecord {
  return {
    userId: USER.id,
    storagePurgedAt: null,
    authDeletedAt: null,
    cleanupAttempts: 0,
    cleanupLeaseUntil: null,
    lastErrorCode: null,
    ...overrides,
  };
}

function repository(existing: AccountDeletionRecord | null = null): AccountDeletionRepository {
  let current = existing;
  return {
    find: vi.fn(async () => current),
    purgeTenant: vi.fn(async () => {
      current = record();
      return current;
    }),
    claimPendingCleanup: vi.fn(async () => []),
    markStoragePurged: vi.fn(async () => undefined),
    markAuthDeleted: vi.fn(async () => undefined),
    releaseCleanup: vi.fn(async () => undefined),
  };
}

function gateway(overrides: Partial<SupabaseDeletionGateway> = {}): SupabaseDeletionGateway {
  return {
    getCurrentUser: vi.fn(async () => ({ id: USER.id, email: USER.email })),
    verifyPassword: vi.fn(async () => true),
    purgeAvatars: vi.fn(async () => undefined),
    hardDeleteUser: vi.fn(async () => undefined),
    ...overrides,
  };
}

function billing(hasNonTerminalSubscription: BillingRepository["hasNonTerminalSubscription"]) {
  return { hasNonTerminalSubscription } satisfies Pick<
    BillingRepository,
    "hasNonTerminalSubscription"
  >;
}

describe("billing enforcement during account deletion", () => {
  it("checks billing after password verification and blocks non-terminal subscriptions", async () => {
    const steps: string[] = [];
    const store = repository();
    const deletionGateway = gateway({
      getCurrentUser: vi.fn(async () => {
        steps.push("current-user");
        return { id: USER.id, email: USER.email };
      }),
      verifyPassword: vi.fn(async () => {
        steps.push("password");
        return true;
      }),
    });
    const hasNonTerminalSubscription = vi.fn(async () => {
      steps.push("billing");
      return true;
    });
    vi.mocked(store.purgeTenant).mockImplementation(async () => {
      steps.push("purge");
      return record();
    });
    const service = createAccountDeletionService(
      store,
      () => deletionGateway,
      billing(hasNonTerminalSubscription),
    );

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "current-password",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "subscription_blocks_account_deletion",
      details: { billingPath: "/app/settings" },
    });

    expect(steps).toEqual(["current-user", "password", "billing"]);
    expect(hasNonTerminalSubscription).toHaveBeenCalledWith(ENV, TENANT_ID);
    expect(store.purgeTenant).not.toHaveBeenCalled();
    expect(deletionGateway.purgeAvatars).not.toHaveBeenCalled();
    expect(deletionGateway.hardDeleteUser).not.toHaveBeenCalled();
  });

  it("does not reveal billing state before the password succeeds", async () => {
    const store = repository();
    const deletionGateway = gateway({ verifyPassword: vi.fn(async () => false) });
    const hasNonTerminalSubscription = vi.fn(async () => true);
    const service = createAccountDeletionService(
      store,
      () => deletionGateway,
      billing(hasNonTerminalSubscription),
    );

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_current_password" });

    expect(hasNonTerminalSubscription).not.toHaveBeenCalled();
    expect(store.purgeTenant).not.toHaveBeenCalled();
  });

  it("continues deletion when billing has no non-terminal subscription", async () => {
    const steps: string[] = [];
    const store = repository();
    vi.mocked(store.purgeTenant).mockImplementation(async () => {
      steps.push("purge");
      return record();
    });
    const deletionGateway = gateway();
    const hasNonTerminalSubscription = vi.fn(async () => {
      steps.push("billing");
      return false;
    });
    const service = createAccountDeletionService(
      store,
      () => deletionGateway,
      billing(hasNonTerminalSubscription),
    );

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "current-password",
      }),
    ).resolves.toBe("deleted");

    expect(steps).toEqual(["billing", "purge"]);
    expect(deletionGateway.purgeAvatars).toHaveBeenCalledWith(USER.id);
    expect(deletionGateway.hardDeleteUser).toHaveBeenCalledWith(USER.id);
  });

  it("resumes an existing deletion tombstone without rechecking password or billing", async () => {
    const store = repository(record());
    const deletionGateway = gateway();
    const hasNonTerminalSubscription = vi.fn(async () => true);
    const service = createAccountDeletionService(
      store,
      () => deletionGateway,
      billing(hasNonTerminalSubscription),
    );

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "current-password",
      }),
    ).resolves.toBe("deleted");

    expect(deletionGateway.getCurrentUser).not.toHaveBeenCalled();
    expect(deletionGateway.verifyPassword).not.toHaveBeenCalled();
    expect(hasNonTerminalSubscription).not.toHaveBeenCalled();
    expect(store.purgeTenant).not.toHaveBeenCalled();
    expect(deletionGateway.purgeAvatars).toHaveBeenCalledWith(USER.id);
    expect(deletionGateway.hardDeleteUser).toHaveBeenCalledWith(USER.id);
  });
});
