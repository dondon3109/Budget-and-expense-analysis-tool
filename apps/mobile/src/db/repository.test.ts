import { LocalWorkspaceRepository } from "./repository";

describe("encrypted local workspace repository", () => {
  it("decodes aggregate database state into typed application values", async () => {
    const database = {
      getFirstAsync: jest.fn(() =>
        Promise.resolve({
          account_count: 2,
          category_count: 4,
          transaction_count: 8,
          unsynced_operation_count: 1,
          unresolved_conflict_count: 0,
        }),
      ),
    };

    const repository = new LocalWorkspaceRepository(database as never);
    await expect(repository.getStats()).resolves.toEqual({
      accountCount: 2,
      categoryCount: 4,
      transactionCount: 8,
      unsyncedOperationCount: 1,
      unresolvedConflictCount: 0,
    });
    expect(database.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("FROM sync_outbox"),
    );
  });

  it("rejects malformed native database values", async () => {
    const database = {
      getFirstAsync: jest.fn(() =>
        Promise.resolve({
          account_count: -1,
          category_count: 0,
          transaction_count: 0,
          unsynced_operation_count: 0,
          unresolved_conflict_count: 0,
        }),
      ),
    };

    await expect(new LocalWorkspaceRepository(database as never).getStats()).rejects.toThrow();
  });

  it("maps synchronized rows to the shared transaction presentation contract", async () => {
    const database = {
      getAllAsync: jest.fn(() =>
        Promise.resolve([
          {
            id: "transaction-1",
            date: "2026-08-13",
            description: "Lunch",
            amount_minor: -25_000,
            currency: "PHP",
            kind: "expense",
            category_id: "category-1",
            category_name: "Dining",
            category_color: "#123456",
            account_id: "account-1",
            account_name: "Wallet",
            notes: null,
            transfer_group_id: null,
            transfer_fee_minor: null,
            to_account_id: null,
            to_account_name: null,
            sync_state: "synced",
          },
        ]),
      ),
    };

    await expect(
      new LocalWorkspaceRepository(database as never).listTransactions(),
    ).resolves.toMatchObject([
      {
        transaction: {
          id: "transaction-1",
          description: "Lunch",
          amountMinor: -25_000,
          accountName: "Wallet",
        },
        syncState: "synced",
      },
    ]);
  });
});
