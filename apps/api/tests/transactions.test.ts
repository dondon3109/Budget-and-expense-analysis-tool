import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { buildTransferLegs, transactionRepository } from "../src/db/transactions";
import type { Bindings } from "../src/types";

interface CapturedStatement {
  query: string;
  bindings: unknown[];
}

const databases: DatabaseSync[] = [];

function createCapturingDatabase(
  statements: CapturedStatement[],
  options: { allResults?: unknown[]; total?: number } = {},
): D1Database {
  return {
    prepare(query: string) {
      return {
        bind(...bindings: unknown[]) {
          statements.push({ query, bindings });
          return {
            async first() {
              return query.includes("COUNT(*)") ? { total: options.total ?? 0 } : null;
            },
            async all() {
              return { results: options.allResults ?? [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function createSqliteEnvironment(): {
  env: Bindings;
  database: DatabaseSync;
  statements: CapturedStatement[];
} {
  const database = new DatabaseSync(":memory:");
  const statements: CapturedStatement[] = [];
  databases.push(database);
  database.exec(`
    CREATE TABLE tenants (
      id text PRIMARY KEY NOT NULL,
      kind text NOT NULL,
      name text NOT NULL
    );
    CREATE TABLE accounts (
      id text PRIMARY KEY NOT NULL,
      tenant_id text NOT NULL,
      name text NOT NULL,
      type text NOT NULL,
      currency text NOT NULL DEFAULT 'PHP',
      archived integer NOT NULL DEFAULT 0
    );
    CREATE TABLE categories (
      id text PRIMARY KEY NOT NULL,
      tenant_id text NOT NULL,
      name text NOT NULL,
      kind text NOT NULL,
      color text NOT NULL,
      icon_emoji text,
      archived integer NOT NULL DEFAULT 0,
      required_plan text NOT NULL DEFAULT 'free'
    );
    CREATE TABLE transactions (
      id text PRIMARY KEY NOT NULL,
      tenant_id text NOT NULL,
      account_id text,
      category_id text NOT NULL,
      date text NOT NULL,
      description text NOT NULL,
      amount_minor integer NOT NULL,
      currency text NOT NULL DEFAULT 'PHP',
      kind text NOT NULL,
      notes text,
      transfer_group_id text,
      transfer_fee_minor integer,
      source_kind text NOT NULL DEFAULT 'manual',
      created_at text NOT NULL DEFAULT (datetime('now')),
      updated_at text NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE effective_pro_entitlements (
      tenant_id text NOT NULL,
      source text NOT NULL
    );
    CREATE TABLE transfer_groups (
      id text NOT NULL,
      tenant_id text NOT NULL,
      from_transaction_id text NOT NULL,
      to_transaction_id text NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
  `);

  const d1 = {
    prepare(sql: string) {
      let bindings: SQLInputValue[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values as SQLInputValue[];
          statements.push({ query: sql, bindings: values });
          return statement;
        },
        async first<T>() {
          return (database.prepare(sql).get(...bindings) as T | undefined) ?? null;
        },
        async all<T>() {
          return {
            success: true,
            results: database.prepare(sql).all(...bindings) as T[],
          };
        },
        async raw<T = unknown[]>() {
          const rows = database.prepare(sql).all(...bindings) as Record<string, unknown>[];
          return rows.map((row) => Object.values(row)) as T[];
        },
        async run() {
          const result = database.prepare(sql).run(...bindings);
          return {
            success: true,
            meta: { changes: Number(result.changes) },
            results: [],
          };
        },
      };
      return statement;
    },
    async batch(statementsToRun: D1PreparedStatement[]) {
      return Promise.all(statementsToRun.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  return { env: { DB: d1 }, database, statements };
}

function seedTransactions(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO tenants (id, kind, name) VALUES
      ('tenant-1', 'personal', 'Tenant One'),
      ('tenant-2', 'personal', 'Tenant Two');
    INSERT INTO accounts (id, tenant_id, name, type) VALUES
      ('cash-1', 'tenant-1', 'Cash', 'cash'),
      ('savings-1', 'tenant-1', 'Savings', 'savings'),
      ('cash-2', 'tenant-2', 'Other Cash', 'cash');
    INSERT INTO categories (id, tenant_id, name, kind, color) VALUES
      ('expense-1', 'tenant-1', 'Food', 'expense', '#ff0000'),
      ('transfer-1', 'tenant-1', 'Transfer', 'transfer', '#0000ff'),
      ('expense-2', 'tenant-2', 'Food', 'expense', '#ff0000');
    INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor,
      currency, kind, notes, transfer_group_id, transfer_fee_minor, created_at
    ) VALUES
      ('expense-old', 'tenant-1', 'cash-1', 'expense-1', '2026-07-01', 'Market', -100, 'PHP', 'expense', 'weekly', NULL, NULL, '2026-07-01 09:00:00'),
      ('expense-new', 'tenant-1', 'cash-1', 'expense-1', '2026-07-03', 'Groceries', -300, 'PHP', 'expense', NULL, NULL, NULL, '2026-07-03 09:00:00'),
      ('transfer-out', 'tenant-1', 'cash-1', 'transfer-1', '2026-07-02', 'Savings top-up', -1000, 'PHP', 'transfer', NULL, 'transfer-group-1', 100, '2026-07-02 09:00:00'),
      ('transfer-in', 'tenant-1', 'savings-1', 'transfer-1', '2026-07-02', 'Savings top-up', 900, 'PHP', 'transfer', NULL, 'transfer-group-1', NULL, '2026-07-02 09:00:01'),
      ('other-tenant', 'tenant-2', 'cash-2', 'expense-2', '2026-07-04', 'Private', -999, 'PHP', 'expense', NULL, NULL, NULL, '2026-07-04 09:00:00');
    INSERT INTO transfer_groups (id, tenant_id, from_transaction_id, to_transaction_id)
    VALUES ('transfer-group-1', 'tenant-1', 'transfer-out', 'transfer-in');
  `);
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("transactionRepository paged SQL", () => {
  async function captureListStatements(query: {
    sortBy: "date" | "description" | "amount";
    sortDirection: "asc" | "desc";
  }) {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };
    await transactionRepository.list(env, "tenant-1", { page: 1, pageSize: 10, ...query });
    return statements;
  }

  it("uses matching COUNT and LIMIT/OFFSET statements", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements, { total: 23 }) };

    await expect(
      transactionRepository.list(env, "tenant-1", {
        page: 3,
        pageSize: 10,
        sortBy: "date",
        sortDirection: "desc",
        accountId: "account-1",
        kind: "expense",
      }),
    ).resolves.toMatchObject({ page: 3, pageSize: 10, total: 23, totalPages: 3 });

    expect(statements).toHaveLength(2);
    const count = statements.find((statement) => statement.query.includes("COUNT(*)"));
    const page = statements.find((statement) => statement.query.includes("LIMIT ? OFFSET ?"));
    expect(count?.query).not.toContain("ORDER BY");
    expect(count?.query).not.toContain("LIMIT");
    expect(page?.query).toContain("ORDER BY t.date DESC, t.created_at DESC, t.id DESC");
    expect(count?.query).toContain("(t.account_id = ? OR peer.account_id = ?)");
    expect(count?.query).toContain("t.kind = ?");
    expect(count?.bindings).toEqual(["tenant-1", "account-1", "account-1", "expense"]);
    expect(page?.bindings).toEqual(["tenant-1", "account-1", "account-1", "expense", 10, 20]);
  });

  it("keeps newer-created transactions first within each date", async () => {
    const descending = await captureListStatements({ sortBy: "date", sortDirection: "desc" });
    const ascending = await captureListStatements({ sortBy: "date", sortDirection: "asc" });
    expect(descending.find((statement) => statement.query.includes("ORDER BY"))?.query).toContain(
      "ORDER BY t.date DESC, t.created_at DESC, t.id DESC",
    );
    expect(ascending.find((statement) => statement.query.includes("ORDER BY"))?.query).toContain(
      "ORDER BY t.date ASC, t.created_at DESC, t.id DESC",
    );
  });

  it("uses recent transactions as stable ties for description and amount", async () => {
    const description = await captureListStatements({
      sortBy: "description",
      sortDirection: "asc",
    });
    const amount = await captureListStatements({ sortBy: "amount", sortDirection: "desc" });
    expect(description.find((statement) => statement.query.includes("ORDER BY"))?.query).toContain(
      "ORDER BY t.description ASC, t.date DESC, t.created_at DESC, t.id DESC",
    );
    expect(amount.find((statement) => statement.query.includes("ORDER BY"))?.query).toContain(
      "ORDER BY ABS(t.amount_minor) DESC, t.date DESC, t.created_at DESC, t.id DESC",
    );
  });

  it("applies escaped search to both count and page queries", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };
    await transactionRepository.list(env, "tenant-1", {
      page: 1,
      pageSize: 10,
      sortBy: "date",
      sortDirection: "desc",
      search: "50%_off\\deal",
    });

    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.query).toContain("LEFT JOIN transactions peer");
      expect(statement.query).toContain("COALESCE(destination.name, '') LIKE ? ESCAPE");
      expect(statement.query).toContain("t.tenant_id = ?");
      expect(statement.bindings).toContain("%50\\%\\_off\\\\deal%");
    }
  });
});

describe("transactionRepository SQLite behavior", () => {
  it("pages logical rows with tenant, transfer, filters, and totals preserved", async () => {
    const { env, database } = createSqliteEnvironment();
    seedTransactions(database);

    await expect(
      transactionRepository.list(env, "tenant-1", {
        page: 1,
        pageSize: 2,
        sortBy: "date",
        sortDirection: "desc",
      }),
    ).resolves.toMatchObject({
      items: [
        { id: "expense-new", amountMinor: -300 },
        {
          id: "transfer-out",
          amountMinor: 1000,
          fromAccountId: "cash-1",
          toAccountId: "savings-1",
          transferFeeMinor: 100,
        },
      ],
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });

    await expect(
      transactionRepository.list(env, "tenant-1", {
        page: 2,
        pageSize: 2,
        sortBy: "date",
        sortDirection: "desc",
      }),
    ).resolves.toMatchObject({
      items: [{ id: "expense-old" }],
      total: 3,
      totalPages: 2,
    });

    await expect(
      transactionRepository.list(env, "tenant-1", {
        page: 1,
        pageSize: 10,
        sortBy: "date",
        sortDirection: "desc",
        accountId: "savings-1",
        search: "Savings",
      }),
    ).resolves.toMatchObject({
      items: [{ id: "transfer-out", toAccountName: "Savings" }],
      total: 1,
      totalPages: 1,
    });
  });

  it("reads a created transaction back with tenant and id SQL", async () => {
    const { env, database, statements } = createSqliteEnvironment();
    seedTransactions(database);

    const created = await transactionRepository.create(env, "tenant-1", {
      accountId: "cash-1",
      categoryId: "expense-1",
      date: "2026-07-05",
      description: "Created item",
      amountMinor: 450,
      currency: "PHP",
      kind: "expense",
    });

    expect(created).toMatchObject({
      description: "Created item",
      amountMinor: -450,
      accountId: "cash-1",
    });
    const readback = statements.find(
      (statement) =>
        statement.query.includes("FROM transactions t") && statement.query.includes("t.id = ?"),
    );
    expect(readback?.query).toContain("t.tenant_id = ?");
    expect(readback?.query).toContain("LIMIT 1");
    expect(readback?.query).not.toContain("ORDER BY");
    expect(readback?.bindings).toEqual(["tenant-1", created.id]);
  });

  it("updates and reads a transfer canonically through either physical leg ID", async () => {
    const { env, database } = createSqliteEnvironment();
    seedTransactions(database);

    const throughDestination = await transactionRepository.update(env, "tenant-1", "transfer-in", {
      date: "2026-07-06",
      description: "Move to savings",
      amountMinor: 2_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer-1",
      fromAccountId: "cash-1",
      toAccountId: "savings-1",
      transferFeeMinor: 200,
    });

    expect(throughDestination).toMatchObject({
      id: "transfer-out",
      amountMinor: 2_000,
      fromAccountId: "cash-1",
      toAccountId: "savings-1",
      transferFeeMinor: 200,
    });

    const throughSender = await transactionRepository.update(env, "tenant-1", "transfer-out", {
      date: "2026-07-07",
      description: "Move more to savings",
      amountMinor: 3_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer-1",
      fromAccountId: "cash-1",
      toAccountId: "savings-1",
      transferFeeMinor: 100,
    });

    expect(throughSender).toMatchObject({
      id: "transfer-out",
      date: "2026-07-07",
      description: "Move more to savings",
      amountMinor: 3_000,
      fromAccountId: "cash-1",
      toAccountId: "savings-1",
      transferFeeMinor: 100,
    });
    expect(
      database
        .prepare(
          `SELECT id, account_id AS accountId, amount_minor AS amountMinor,
                  transfer_fee_minor AS transferFeeMinor
           FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor`,
        )
        .all("transfer-group-1"),
    ).toEqual([
      { id: "transfer-out", accountId: "cash-1", amountMinor: -3_000, transferFeeMinor: 100 },
      { id: "transfer-in", accountId: "savings-1", amountMinor: 2_900, transferFeeMinor: null },
    ]);
  });
});

describe("transactionRepository unpaged reads", () => {
  const row = {
    id: "transaction-1",
    date: "2026-07-15",
    description: "Record",
    amountMinor: -100,
    transferFeeMinor: null,
    currency: "PHP",
    kind: "expense",
    categoryId: "category-1",
    categoryName: "Food",
    categoryColor: "#ff0000",
    accountId: "account-1",
    accountName: "Cash",
    notes: null,
    transferGroupId: null,
    toAccountId: null,
    toAccountName: null,
  };

  it("keeps export unpaged and enforces its 5,000-row guard", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = {
      DB: createCapturingDatabase(statements, {
        allResults: Array.from({ length: 5001 }, (_, index) => ({ ...row, id: `row-${index}` })),
      }),
    };

    await expect(
      transactionRepository.export(env, "tenant-1", {
        sortBy: "date",
        sortDirection: "desc",
      }),
    ).rejects.toMatchObject({ status: 413, code: "export_too_large" });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).not.toContain("LIMIT");
    expect(statements[0]?.query).not.toContain("OFFSET");
  });

  it("keeps calendar unpaged and enforces its 5,000-row guard", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = {
      DB: createCapturingDatabase(statements, {
        allResults: Array.from({ length: 5001 }, (_, index) => ({ ...row, id: `row-${index}` })),
      }),
    };

    await expect(
      transactionRepository.calendar(env, "tenant-1", { month: "2026-07-01" }),
    ).rejects.toMatchObject({ status: 413, code: "calendar_month_too_large" });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).not.toContain("LIMIT");
    expect(statements[0]?.query).not.toContain("OFFSET");
  });
});

describe("buildTransferLegs transfer fees", () => {
  it("deducts the fee from the receiving leg and records it on the sender leg", () => {
    const [fromLeg, toLeg] = buildTransferLegs({
      date: "2026-07-20",
      description: "",
      amountMinor: 10_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer",
      fromAccountId: "account-a",
      toAccountId: "account-b",
      transferFeeMinor: 1_000,
    });

    expect(fromLeg).toEqual({
      accountId: "account-a",
      amountMinor: -10_000,
      transferFeeMinor: 1_000,
      description: "Transfer",
    });
    expect(toLeg).toEqual({
      accountId: "account-b",
      amountMinor: 9_000,
      transferFeeMinor: null,
      description: "Transfer",
    });
  });

  it("defaults a missing fee to zero and keeps both legs symmetric", () => {
    const [fromLeg, toLeg] = buildTransferLegs({
      date: "2026-07-20",
      description: "Savings top-up",
      amountMinor: 5_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer",
      fromAccountId: "account-a",
      toAccountId: "account-b",
    });

    expect(fromLeg).toEqual({
      accountId: "account-a",
      amountMinor: -5_000,
      transferFeeMinor: null,
      description: "Savings top-up",
    });
    expect(toLeg).toEqual({
      accountId: "account-b",
      amountMinor: 5_000,
      transferFeeMinor: null,
      description: "Savings top-up",
    });
  });
});
