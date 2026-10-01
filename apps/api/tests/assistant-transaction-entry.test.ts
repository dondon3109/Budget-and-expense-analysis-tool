import type { AccountRecord, CategoryRecord } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import {
  draftTransaction,
  loadEntryHistory,
  suggestTransactionDetails,
  type EntryHistoryRow,
  type TransactionDraftInput,
} from "../src/assistant/transaction-entry";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

function account(id: string, name: string, balanceMinor: number, archived = false): AccountRecord {
  return { id, name, type: "other", currency: "PHP", balanceMinor, archived };
}

function category(
  id: string,
  name: string,
  kind: "income" | "expense" = "expense",
): CategoryRecord {
  return {
    id,
    name,
    kind,
    color: "#000000",
    archived: false,
    system: false,
    origin: "custom",
    requiredPlan: "free",
    locked: false,
  };
}

const accounts = [
  account("account-gcash", "GCash", 150_000),
  account("account-cash", "Cash", 80_000),
  account("account-old", "Old wallet", 5_000, true),
];
const categories = [
  category("category-food", "Food & dining"),
  category("category-transport", "Transportation"),
  category("category-health", "Health"),
  category("category-salary", "Salary", "income"),
];

function row(overrides: Partial<EntryHistoryRow>): EntryHistoryRow {
  return {
    date: "2026-07-20",
    description: "Jollibee SM North",
    amountMinor: -18_000,
    currency: "PHP",
    categoryName: "Food & dining",
    accountName: "GCash",
    ...overrides,
  };
}

const history: EntryHistoryRow[] = [
  row({ date: "2026-07-30", amountMinor: -22_000 }),
  row({ date: "2026-07-25", description: "Grab ride", categoryName: "Transportation" }),
  row({ date: "2026-07-20", amountMinor: -18_000 }),
  row({ date: "2026-07-10", description: "jollibee  sm north", amountMinor: -16_000 }),
  row({ date: "2026-07-05", description: "Grab ride", categoryName: "Transportation" }),
];

const draftInput: TransactionDraftInput = {
  kind: "expense",
  description: "Jollibee",
  categoryName: "Food & dining",
  accountName: "GCash",
  date: "2026-08-02",
  currentDate: "2026-08-02",
};

describe("assistant transaction suggestions", () => {
  it("suggests the category, account, and typical amount used at a place before", () => {
    const result = suggestTransactionDetails(
      { through: "2026-08-02", place: "Jollibee", kind: "expense" },
      history,
      accounts,
      categories,
    );

    expect(result.data).toMatchObject({
      placeMatched: true,
      suggestionBasis: "past_entries_at_place",
      suggestedCategory: "Food & dining",
      mostUsedAccount: "GCash",
      suggestions: [
        {
          description: "Jollibee SM North",
          categoryName: "Food & dining",
          accountName: "GCash",
          typicalAmount: "PHP 180.00",
          lastAmount: "PHP 220.00",
          lastDate: "2026-07-30",
          timesRecorded: 3,
        },
      ],
      accounts: [
        { name: "GCash", balance: "PHP 1,500.00" },
        { name: "Cash", balance: "PHP 800.00" },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/account-|category-/);
  });

  it("falls back to frequent entries and a category matched from the place name", () => {
    const result = suggestTransactionDetails(
      { through: "2026-08-02", place: "Mercury Drug", kind: "expense" },
      history,
      accounts,
      categories,
    );

    expect(result.data).toMatchObject({
      placeMatched: false,
      suggestionBasis: "most_frequent_entries",
      suggestedCategory: "Health",
      categorySuggestionBasis: "place_name",
    });
  });

  it("keeps typical amounts within one currency", () => {
    const result = suggestTransactionDetails(
      { through: "2026-08-02", place: "Netflix", kind: "expense" },
      [
        row({ description: "Netflix", amountMinor: -54_900 }),
        row({ description: "Netflix", amountMinor: -1_500, currency: "USD" }),
      ],
      accounts,
      categories,
    );
    const suggestions = (result.data as { suggestions: Array<{ typicalAmount: string }> })
      .suggestions;
    expect(suggestions.map((item) => item.typicalAmount).sort()).toEqual([
      "PHP 549.00",
      "USD 15.00",
    ]);
  });

  it("does not match a short place token inside a longer word", () => {
    const result = suggestTransactionDetails(
      { through: "2026-08-02", place: "SM", kind: "expense" },
      [row({ description: "Smart load" })],
      accounts,
      categories,
    );
    expect(result.data).toMatchObject({ placeMatched: false });
  });
});

describe("assistant transaction drafts", () => {
  it("drafts a stated amount against active records", () => {
    const result = draftTransaction({ ...draftInput, amount: "250" }, accounts, categories);

    expect(result.draft).toEqual({
      status: "pending",
      kind: "expense",
      date: "2026-08-02",
      description: "Jollibee",
      amountMinor: 25_000,
      currency: "PHP",
      categoryId: "category-food",
      categoryName: "Food & dining",
      accountId: "account-gcash",
      accountName: "GCash",
    });
    expect(result.envelope.data).toMatchObject({
      status: "ready",
      saved: false,
      draft: { amount: "PHP 250.00" },
    });
    expect(JSON.stringify(result.envelope)).not.toMatch(/account-|category-/);
  });

  it("asks the user to confirm the recorded balance before deriving an amount", () => {
    const result = draftTransaction({ ...draftInput, balanceAfter: "1050" }, accounts, categories);

    expect(result.draft).toBeUndefined();
    expect(result.envelope.data).toMatchObject({
      status: "confirm_balance_before",
      accountName: "GCash",
      recordedBalance: "PHP 1,500.00",
      balanceAfter: "PHP 1,050.00",
    });
    expect(result.envelope.dataQuality.status).toBe("limited");
  });

  it("uses the user's own starting balance when they give one", () => {
    const result = draftTransaction(
      { ...draftInput, balanceBefore: "2000", balanceAfter: "1700.50" },
      accounts,
      categories,
    );
    expect(result.draft?.amountMinor).toBe(29_950);
    expect(result.envelope.data).toMatchObject({
      calculation: {
        balanceBefore: "PHP 2,000.00",
        balanceAfter: "PHP 1,700.50",
        amount: "PHP 299.50",
      },
    });
  });

  it("refuses a balance that does not imply spending instead of drafting a negative amount", () => {
    const result = draftTransaction(
      { ...draftInput, balanceBefore: "1500", balanceAfter: "2000" },
      accounts,
      categories,
    );
    expect(result.draft).toBeUndefined();
    expect(result.envelope.data).toMatchObject({ status: "balances_do_not_imply_amount" });
  });

  it("reports an unknown or archived account with the active choices", () => {
    const result = draftTransaction(
      { ...draftInput, accountName: "Old wallet", amount: "250" },
      accounts,
      categories,
    );
    expect(result.draft).toBeUndefined();
    expect(result.envelope.data).toEqual({
      status: "account_not_found",
      accountName: "Old wallet",
      availableAccounts: ["GCash", "Cash"],
    });
  });

  it("matches a loosely named category of the same kind only", () => {
    expect(
      draftTransaction({ ...draftInput, categoryName: "food", amount: "250" }, accounts, categories)
        .draft?.categoryId,
    ).toBe("category-food");
    expect(
      draftTransaction(
        { ...draftInput, categoryName: "Salary", amount: "250" },
        accounts,
        categories,
      ).envelope.data,
    ).toMatchObject({ status: "category_not_found" });
  });

  it("refuses dates in the future or more than a year back", () => {
    for (const date of ["2026-08-03", "2025-07-01"]) {
      expect(
        draftTransaction({ ...draftInput, date, amount: "250" }, accounts, categories).envelope
          .data,
      ).toMatchObject({ status: "date_out_of_range" });
    }
  });
});

describe("loadEntryHistory against D1", () => {
  it("reads the tenant's own rows in active categories and blanks archived or missing accounts", async () => {
    const { binding, database } = createD1TestDatabase();
    try {
      for (const tenant of ["tenant-a", "tenant-b"]) {
        database
          .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')")
          .run(tenant);
        database
          .prepare(
            "INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, 'GCash', 'cash')",
          )
          .run(`${tenant}-gcash`, tenant);
        database
          .prepare(
            "INSERT INTO categories (id, tenant_id, name, kind, color) VALUES (?, ?, 'Food', 'expense', '#000000')",
          )
          .run(`${tenant}-food`, tenant);
      }
      database
        .prepare(
          "INSERT INTO accounts (id, tenant_id, name, type, archived) VALUES ('old-wallet', 'tenant-a', 'Old wallet', 'cash', 1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO categories (id, tenant_id, name, kind, color, archived) VALUES ('old-food', 'tenant-a', 'Old food', 'expense', '#000000', 1)",
        )
        .run();
      const insert = database.prepare(
        `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, kind)
         VALUES (?, ?, ?, ?, ?, ?, -25000, 'expense')`,
      );
      insert.run("t1", "tenant-a", "tenant-a-gcash", "tenant-a-food", "2026-08-03", "Jollibee");
      insert.run("t2", "tenant-a", "old-wallet", "tenant-a-food", "2026-08-02", "Mang Inasal");
      insert.run("t3", "tenant-a", null, "tenant-a-food", "2026-08-01", "Cash lunch");
      insert.run("t4", "tenant-a", "tenant-a-gcash", "old-food", "2026-08-01", "Archived category");
      insert.run("t5", "tenant-b", "tenant-b-gcash", "tenant-b-food", "2026-08-01", "Other tenant");
      insert.run("t6", "tenant-a", "tenant-a-gcash", "tenant-a-food", "2026-06-01", "Too old");

      const rows = await loadEntryHistory(
        { env: { DB: binding } as unknown as Bindings, tenantId: "tenant-a" },
        "expense",
        "2026-07-01",
        "2026-08-31",
      );

      expect(rows.map((row) => [row.description, row.categoryName, row.accountName])).toEqual([
        ["Jollibee", "Food", "GCash"],
        ["Mang Inasal", "Food", null],
        ["Cash lunch", "Food", null],
      ]);
    } finally {
      database.close();
    }
  });
});
