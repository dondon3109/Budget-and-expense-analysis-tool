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

  it("decodes native account and category setup rows without financial state in memory stores", async () => {
    const database = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "account-1",
            name: "Wallet",
            type: "cash",
            currency: "PHP",
            system: 0,
            server_revision: 2,
            sync_state: "synced",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "category-1",
            name: "Dining",
            kind: "expense",
            color: "#123456",
            system: 0,
            required_plan: "free",
            locked: 0,
            server_revision: 3,
            sync_state: "pending",
          },
        ]),
    };

    await expect(
      new LocalWorkspaceRepository(database as never).getReferenceData(),
    ).resolves.toEqual({
      accounts: [
        {
          id: "account-1",
          name: "Wallet",
          type: "cash",
          currency: "PHP",
          system: false,
          serverRevision: 2,
          syncState: "synced",
        },
      ],
      categories: [
        {
          id: "category-1",
          name: "Dining",
          kind: "expense",
          color: "#123456",
          system: false,
          requiredPlan: "free",
          locked: false,
          serverRevision: 3,
          syncState: "pending",
        },
      ],
    });
  });

  it("returns only decoded local choices and an editable non-transfer transaction", async () => {
    const database = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([{ id: "account-1", name: "Wallet", currency: "PHP", pending: 0 }])
        .mockResolvedValueOnce([
          {
            id: "category-1",
            name: "Dining",
            kind: "expense",
            color: "#123456",
            pending: 0,
          },
        ]),
      getFirstAsync: jest.fn(() =>
        Promise.resolve({
          id: "transaction-1",
          account_id: "account-1",
          category_id: "category-1",
          date: "2026-08-13",
          description: "Lunch",
          amount_minor: -25_000,
          currency: "PHP",
          kind: "expense",
          notes: "Team meal",
          transfer_group_id: null,
          transfer_fee_minor: null,
          deleted_at: null,
          sync_state: "pending",
        }),
      ),
    };

    await expect(
      new LocalWorkspaceRepository(database as never).getTransactionFormData("transaction-1"),
    ).resolves.toEqual({
      accounts: [{ id: "account-1", name: "Wallet", currency: "PHP", pending: false }],
      categories: [
        {
          id: "category-1",
          name: "Dining",
          kind: "expense",
          color: "#123456",
          pending: false,
        },
      ],
      transaction: {
        id: "transaction-1",
        input: {
          accountId: "account-1",
          categoryId: "category-1",
          date: "2026-08-13",
          description: "Lunch",
          amountMinor: 25_000,
          currency: "PHP",
          kind: "expense",
          notes: "Team meal",
        },
        syncState: "pending",
      },
      unavailableReason: null,
    });
    expect(database.getAllAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("server_revision > 0"),
    );
    expect(database.getAllAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("server_revision > 0"),
    );
  });

  it("returns a linked transfer as one editable atomic command", async () => {
    const database = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([
          { id: "account-1", name: "Wallet", currency: "PHP", pending: 0 },
          { id: "account-2", name: "Savings", currency: "PHP", pending: 0 },
        ])
        .mockResolvedValueOnce([
          {
            id: "category-transfer",
            name: "Transfer",
            kind: "transfer",
            color: "#008877",
            pending: 0,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "transaction-1",
            account_id: "account-1",
            category_id: "category-transfer",
            date: "2026-08-13",
            description: "Transfer",
            amount_minor: -25_000,
            currency: "PHP",
            kind: "transfer",
            notes: null,
            transfer_group_id: "group-1",
            transfer_fee_minor: 100,
            deleted_at: null,
            sync_state: "synced",
          },
          {
            id: "transaction-2",
            account_id: "account-2",
            category_id: "category-transfer",
            date: "2026-08-13",
            description: "Transfer",
            amount_minor: 24_900,
            currency: "PHP",
            kind: "transfer",
            notes: null,
            transfer_group_id: "group-1",
            transfer_fee_minor: null,
            deleted_at: null,
            sync_state: "synced",
          },
        ]),
      getFirstAsync: jest.fn(() =>
        Promise.resolve({
          id: "transaction-1",
          account_id: "account-1",
          category_id: "category-transfer",
          date: "2026-08-13",
          description: "Transfer",
          amount_minor: -25_000,
          currency: "PHP",
          kind: "transfer",
          notes: null,
          transfer_group_id: "group-1",
          transfer_fee_minor: 100,
          deleted_at: null,
          sync_state: "synced",
        }),
      ),
    };

    const result = await new LocalWorkspaceRepository(database as never).getTransactionFormData(
      "transaction-1",
    );
    expect(result).toMatchObject({
      transaction: {
        id: "transaction-1",
        input: {
          kind: "transfer",
          fromAccountId: "account-1",
          toAccountId: "account-2",
          categoryId: "category-transfer",
          amountMinor: 25_000,
          transferFeeMinor: 100,
        },
        syncState: "synced",
      },
      unavailableReason: null,
    });
  });
});
