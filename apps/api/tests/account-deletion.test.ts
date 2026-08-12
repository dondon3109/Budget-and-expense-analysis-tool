import { describe, expect, it, vi } from "vitest";

import {
  createAccountDeletionService,
  type SupabaseDeletionGateway,
} from "../src/account-deletion";
import type { AccountDeletionRecord, AccountDeletionRepository } from "../src/db/account-deletion";
import { accountDeletionRepository } from "../src/db/account-deletion";
import type { Bindings } from "../src/types";

const USER = { id: "user-1", email: "person@example.com", role: "authenticated" } as const;
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

function createRepository(existing: AccountDeletionRecord | null = null) {
  let current = existing;
  const repository: AccountDeletionRepository = {
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
  return repository;
}

function createGateway(overrides: Partial<SupabaseDeletionGateway> = {}): SupabaseDeletionGateway {
  return {
    getCurrentUser: vi.fn(async () => ({ id: USER.id, email: "person@example.com" })),
    verifyPassword: vi.fn(async () => true),
    purgeAvatars: vi.fn(async () => undefined),
    hardDeleteUser: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("AccountDeletionService", () => {
  it("reauthenticates the JWT subject, purges D1, then clears Storage before Auth", async () => {
    const steps: string[] = [];
    const repository = createRepository();
    repository.purgeTenant = vi.fn(async () => {
      steps.push("d1");
      return record();
    });
    repository.markStoragePurged = vi.fn(async () => {
      steps.push("storage-mark");
    });
    repository.markAuthDeleted = vi.fn(async () => {
      steps.push("auth-mark");
    });
    const gateway = createGateway({
      getCurrentUser: vi.fn(async () => {
        steps.push("current-user");
        return { id: USER.id, email: "person@example.com" };
      }),
      verifyPassword: vi.fn(async () => {
        steps.push("password");
        return true;
      }),
      purgeAvatars: vi.fn(async () => {
        steps.push("storage");
      }),
      hardDeleteUser: vi.fn(async () => {
        steps.push("auth");
      }),
    });
    const service = createAccountDeletionService(repository, () => gateway);

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "password",
      }),
    ).resolves.toBe("deleted");

    expect(steps).toEqual([
      "current-user",
      "password",
      "d1",
      "storage",
      "storage-mark",
      "auth",
      "auth-mark",
    ]);
    expect(gateway.verifyPassword).toHaveBeenCalledWith("person@example.com", "password", USER.id);
  });

  it("does not purge data when the current password cannot be verified", async () => {
    const repository = createRepository();
    const gateway = createGateway({ verifyPassword: vi.fn(async () => false) });
    const service = createAccountDeletionService(repository, () => gateway);

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "wrong",
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_current_password" });

    expect(repository.purgeTenant).not.toHaveBeenCalled();
    expect(gateway.purgeAvatars).not.toHaveBeenCalled();
    expect(gateway.hardDeleteUser).not.toHaveBeenCalled();
  });

  it("keeps the tombstone and schedules a retry if Storage cleanup fails", async () => {
    const existing = record();
    const repository = createRepository(existing);
    const gateway = createGateway({
      purgeAvatars: vi.fn(async () => Promise.reject(new Error("down"))),
    });
    const service = createAccountDeletionService(repository, () => gateway);

    await expect(
      service.deleteAccount({
        env: ENV,
        user: USER,
        accessToken: "access-token",
        password: "password",
      }),
    ).resolves.toBe("cleanup_pending");

    expect(repository.purgeTenant).not.toHaveBeenCalled();
    expect(repository.releaseCleanup).toHaveBeenCalledWith(ENV, USER.id, "auth_unavailable");
    expect(gateway.hardDeleteUser).not.toHaveBeenCalled();
  });
});

describe("account deletion repository", () => {
  it("purges tenant bug reports in the same fail-closed D1 batch", async () => {
    const preparedSql: string[] = [];
    const batchedSql: string[] = [];
    let findCount = 0;
    const database = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        const statement = {
          sql,
          bind: vi.fn(() => statement),
          first: vi.fn(async () => {
            findCount += 1;
            return findCount === 1
              ? null
              : {
                  userId: USER.id,
                  storagePurgedAt: null,
                  authDeletedAt: null,
                  cleanupAttempts: 0,
                  cleanupLeaseUntil: null,
                  lastErrorCode: null,
                };
          }),
        };
        return statement;
      }),
      batch: vi.fn(async (statements: Array<{ sql: string }>) => {
        batchedSql.push(...statements.map((statement) => statement.sql));
        return [];
      }),
    } as unknown as D1Database;

    await accountDeletionRepository.purgeTenant({ DB: database }, USER.id);

    expect(batchedSql).toContain("DELETE FROM bug_reports WHERE tenant_id = ?");
    expect(preparedSql).toContain("DELETE FROM bug_reports WHERE tenant_id = ?");
    expect(batchedSql).toContain("DELETE FROM customer_reviews WHERE tenant_id = ?");
  });
});
