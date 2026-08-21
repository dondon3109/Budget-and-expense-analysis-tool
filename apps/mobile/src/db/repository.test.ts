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

  it("builds parameterized search and filter queries", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([]);
    const repository = new LocalWorkspaceRepository({ getAllAsync } as never);

    await repository.queryTransactions({
      search: "coffee",
      kind: "expense",
      accountId: "account-1",
      limit: 25,
    });

    const [sql, ...params] = getAllAsync.mock.calls[0] as [string, ...Array<string | number>];
    expect(sql).toContain("transaction_row.kind = ?");
    expect(sql).toContain("transaction_row.account_id = ?");
    expect(sql).toContain("instr(lower(transaction_row.description), lower(?))");
    expect(sql).toContain("instr(lower(category.name), lower(?))");
    expect(params).toEqual(["expense", "account-1", "coffee", "coffee", 25]);

    await repository.queryTransactions({});
    const [plainSql, ...plainParams] = getAllAsync.mock.calls[1] as [
      string,
      ...Array<string | number>,
    ];
    expect(plainSql).not.toContain("instr(lower");
    expect(plainSql).not.toContain("transaction_row.kind = ?");
    expect(plainParams).toEqual([100]);
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
        .mockResolvedValueOnce([
          { id: "account-1", name: "Wallet", type: "cash", currency: "PHP", pending: 0 },
        ])
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
      accounts: [
        { id: "account-1", name: "Wallet", type: "cash", currency: "PHP", pending: false },
      ],
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
          { id: "account-1", name: "Wallet", type: "cash", currency: "PHP", pending: 0 },
          { id: "account-2", name: "Savings", type: "savings", currency: "PHP", pending: 0 },
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

  it("builds dashboard rows with ledger balances and interest", async () => {
    const database = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "transaction-1",
            date: "2026-08-10",
            description: "Lunch",
            amount_minor: -25_000,
            currency: "PHP",
            kind: "expense",
            category_id: "category-1",
            category_name: "Dining",
            category_color: "#123456",
            account_name: "Wallet",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "account-1",
            name: "Wallet",
            type: "cash",
            currency: "PHP",
            archived: 0,
            system: 0,
            interest_json: JSON.stringify({
              enabled: true,
              annualRateBasisPoints: 500,
              frequency: "monthly",
              payDay: 15,
            }),
            balance_php_minor: 12_000,
            balance_usd_minor: 0,
          },
        ])
        .mockResolvedValueOnce([
          {
            category_id: "category-1",
            category_name: "Dining",
            category_color: "#123456",
            month: "2026-08-01",
            limit_minor: 50_000,
          },
        ]),
    };

    const result = await new LocalWorkspaceRepository(database as never).getDashboardData();
    expect(result.transactions).toEqual([
      {
        id: "transaction-1",
        date: "2026-08-10",
        description: "Lunch",
        amountMinor: -25_000,
        currency: "PHP",
        kind: "expense",
        categoryId: "category-1",
        categoryName: "Dining",
        categoryColor: "#123456",
        accountName: "Wallet",
      },
    ]);
    expect(result.accounts).toEqual([
      {
        id: "account-1",
        name: "Wallet",
        type: "cash",
        currency: "PHP",
        balanceMinor: 12_000,
        balancesByCurrency: { PHP: 12_000, USD: 0 },
        archived: false,
        system: false,
        interest: {
          enabled: true,
          annualRateBasisPoints: 500,
          frequency: "monthly",
          payDay: 15,
        },
      },
    ]);
    expect(result.budgets).toEqual([
      {
        categoryId: "category-1",
        categoryName: "Dining",
        categoryColor: "#123456",
        month: "2026-08-01",
        limitMinor: 50_000,
      },
    ]);
  });

  it("reads a month's budgets with spent totals and editable categories", async () => {
    const database = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "budget-1",
            category_id: "category-1",
            category_name: "Dining",
            category_color: "#123456",
            limit_minor: 50_000,
            spent_minor: 25_000,
            sync_state: "synced",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "category-1",
            name: "Dining",
            kind: "expense",
            color: "#123456",
            pending: 0,
          },
          {
            id: "category-2",
            name: "Groceries",
            kind: "expense",
            color: "#0F766E",
            pending: 0,
          },
        ]),
    };

    const result = await new LocalWorkspaceRepository(database as never).getBudgetMonth(
      "2026-08-01",
    );
    expect(result.budgets).toEqual([
      {
        id: "budget-1",
        categoryId: "category-1",
        categoryName: "Dining",
        categoryColor: "#123456",
        limitMinor: 50_000,
        spentMinor: 25_000,
        syncState: "synced",
      },
    ]);
    expect(result.categories).toEqual([
      { id: "category-1", name: "Dining", kind: "expense", color: "#123456", pending: false },
      { id: "category-2", name: "Groceries", kind: "expense", color: "#0F766E", pending: false },
    ]);
  });
});
