import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SQLiteDatabase } from "expo-sqlite";

import { ApiTransportError } from "@/api/authenticated";
import {
  checkInSubscription,
  getSubscriptionUsage,
  setSubscriptionUsageTracking,
  undoSubscriptionCheckIn,
} from "@/api/subscription-usage";
import { LocalDatabaseWriter } from "@/db/database-writer";
import { migrations } from "@/db/migrations";
import { LocalWorkspaceRepository } from "@/db/repository";
import { LocalTransactionMutationRepository } from "@/db/transaction-mutation-repository";
import type { LocalWorkspace } from "@/db/workspace";
import { uploadSubscriptionUsage } from "./subscription-usage-upload";

jest.mock("@/api/subscription-usage", () => ({
  checkInSubscription: jest.fn(),
  undoSubscriptionCheckIn: jest.fn(),
  setSubscriptionUsageTracking: jest.fn(),
  getSubscriptionUsage: jest.fn(),
}));

function openWorkspace() {
  const native = new DatabaseSync(":memory:");
  for (const migration of migrations) native.exec(migration.sql);
  native.exec(`
    INSERT INTO categories (
      id, name, kind, color, archived, system, origin, required_plan, locked, server_revision, sync_state
    ) VALUES ('category-1', 'Fun', 'expense', '#123456', 0, 0, 'custom', 'free', 0, 1, 'synced');
    INSERT INTO subscriptions (
      id, name, amount_minor, currency, billing_cycle, next_billing_date, status, category_id,
      server_revision, sync_state
    ) VALUES
      ('netflix', 'Netflix', 54900, 'PHP', 'monthly', '2026-12-01', 'active', 'category-1', 1, 'synced'),
      ('new-gym', 'Gym', 150000, 'PHP', 'monthly', '2026-12-01', 'active', 'category-1', 0, 'pending');
  `);
  const database = {
    getFirstAsync: async (source: string, ...params: unknown[]) =>
      native.prepare(source).get(...(params as SQLInputValue[])) ?? null,
    getAllAsync: async (source: string, ...params: unknown[]) =>
      native.prepare(source).all(...(params as SQLInputValue[])),
    runAsync: async (source: string, ...params: unknown[]) =>
      native.prepare(source).run(...(params as SQLInputValue[])),
    withTransactionAsync: async (task: () => Promise<void>) => {
      native.exec("BEGIN IMMEDIATE");
      try {
        await task();
        native.exec("COMMIT");
      } catch (error) {
        native.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
  const workspace = {
    repository: new LocalWorkspaceRepository(database),
    transactionMutations: new LocalTransactionMutationRepository(
      database,
      new LocalDatabaseWriter(),
    ),
  } as unknown as LocalWorkspace;
  const queued = () =>
    native.prepare("SELECT subscription_id, action FROM subscription_usage_queue").all();
  return { workspace, queued };
}

const offline = () => new ApiTransportError("Offline.", "network", 0);
const usage = (subscriptionId: string, usedOn: string[]) => ({ subscriptionId, usedOn });

describe("offline Subscription ROI taps", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("shows a tap at once and keeps it queued while offline", async () => {
    const { workspace, queued } = openWorkspace();
    await workspace.transactionMutations.queueSubscriptionUsage(
      "netflix",
      "check_in",
      "2026-11-16",
    );
    await workspace.transactionMutations.queueSubscriptionUsage("netflix", "untrack");

    await expect(workspace.repository.getSubscriptionUsage()).resolves.toEqual({
      usage: [usage("netflix", ["2026-11-16"])],
      tracking: [{ subscriptionId: "netflix", tracked: false }],
    });

    jest.mocked(checkInSubscription).mockRejectedValue(offline());
    await uploadSubscriptionUsage(workspace, "token");
    expect(queued()).toHaveLength(2);
    expect(getSubscriptionUsage).not.toHaveBeenCalled();
  });

  it("uploads taps in order, then reads the Worker's list back", async () => {
    const { workspace, queued } = openWorkspace();
    await workspace.transactionMutations.queueSubscriptionUsage(
      "netflix",
      "check_in",
      "2026-11-16",
    );
    await workspace.transactionMutations.queueSubscriptionUsage("netflix", "undo", "2026-11-16");
    await workspace.transactionMutations.queueSubscriptionUsage("netflix", "track");
    jest.mocked(getSubscriptionUsage).mockResolvedValue({
      usage: [usage("netflix", ["2026-11-02"])],
      tracking: [{ subscriptionId: "netflix", tracked: true }],
    });

    await uploadSubscriptionUsage(workspace, "token");

    const api = { accessToken: "token" };
    expect(checkInSubscription).toHaveBeenCalledWith(api, "netflix", "2026-11-16");
    expect(undoSubscriptionCheckIn).toHaveBeenCalledWith(api, "netflix", "2026-11-16");
    expect(setSubscriptionUsageTracking).toHaveBeenCalledWith(api, "netflix", true);
    expect(jest.mocked(checkInSubscription).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(undoSubscriptionCheckIn).mock.invocationCallOrder[0]!,
    );
    expect(queued()).toHaveLength(0);
    await expect(workspace.repository.getSubscriptionUsage()).resolves.toEqual({
      usage: [usage("netflix", ["2026-11-02"])],
      tracking: [{ subscriptionId: "netflix", tracked: true }],
    });
  });

  it("drops a tap the Worker refuses and holds one for a bill still syncing", async () => {
    const { workspace, queued } = openWorkspace();
    await workspace.transactionMutations.queueSubscriptionUsage(
      "new-gym",
      "check_in",
      "2026-11-16",
    );
    await workspace.transactionMutations.queueSubscriptionUsage(
      "netflix",
      "check_in",
      "2026-11-16",
    );
    jest
      .mocked(checkInSubscription)
      .mockRejectedValue(new ApiTransportError("Pro only.", "plan_limit", 403));
    jest.mocked(getSubscriptionUsage).mockResolvedValue({ usage: [], tracking: [] });

    await uploadSubscriptionUsage(workspace, "token");

    expect(checkInSubscription).toHaveBeenCalledTimes(1);
    expect(checkInSubscription).toHaveBeenCalledWith(
      { accessToken: "token" },
      "netflix",
      "2026-11-16",
    );
    // The Gym tap waits for its bill, so the phone keeps its own copy instead of the list.
    expect(queued()).toEqual([{ subscription_id: "new-gym", action: "check_in" }]);
    await expect(workspace.repository.getSubscriptionUsage()).resolves.toMatchObject({
      usage: [usage("netflix", ["2026-11-16"]), usage("new-gym", ["2026-11-16"])],
    });
  });
});
