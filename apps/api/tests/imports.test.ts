import { parseCsv, type CategoryRecord } from "@budget/shared";
import { describe, expect, it } from "vitest";

import {
  applyCategoryOverridesToRows,
  assertImportFileSize,
  buildImportTransactionInsertSql,
  assertImportRowCount,
} from "../src/db/imports";
import { prepareImportRows, type PreparedImportRecord } from "../src/imports/prepare";

function captureError(action: () => void): unknown {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

const categories: CategoryRecord[] = [
  {
    id: "food",
    name: "Food & dining",
    kind: "expense",
    color: "#dc8b3f",
    archived: false,
    system: false,
  },
];

const uncategorizedCategories: CategoryRecord[] = [
  {
    id: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#6b7280",
    archived: false,
    system: true,
  },
  {
    id: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    archived: false,
    system: true,
  },
  {
    id: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    archived: false,
    system: true,
  },
];

const mapping = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  kind: "Type",
  category: "Category",
};

describe("import commit category guard", () => {
  it("rechecks tenant, active status, kind, and non-system overrides inside the insert", () => {
    const regularSql = buildImportTransactionInsertSql(false);
    const overrideSql = buildImportTransactionInsertSql(true);

    expect(regularSql).toContain("tenant_id = ? AND archived = 0 AND kind = ?");
    expect(regularSql).not.toContain("system_key IS NULL");
    expect(overrideSql).toContain("system_key IS NULL");
    expect(overrideSql).toContain("(SELECT id FROM categories");
  });
});

describe("import preparation", () => {
  it("rejects oversized files and row sets before preparation", () => {
    expect(captureError(() => assertImportFileSize("x".repeat(1_000_001)))).toMatchObject({
      status: 413,
      code: "file_too_large",
    });
    expect(captureError(() => assertImportRowCount(501))).toMatchObject({
      status: 413,
      code: "too_many_rows",
    });
  });

  it("keeps valid rows while reporting invalid and within-file duplicate rows", async () => {
    const csv = parseCsv(
      [
        "Date,Description,Amount,Type,Category",
        "2026-07-20,Weekly market,-500.00,expense,Food & dining",
        "2026-02-30,Impossible date,-20.00,expense,Food & dining",
        "2026-07-20,Weekly market,-500.00,expense,Food & dining",
      ].join("\n"),
    );
    const prepared = await prepareImportRows(
      csv,
      mapping,
      categories,
      new Set(),
      "user:user-1:account:default",
    );
    expect(prepared.rows.map((row) => row.status)).toEqual(["ready", "invalid", "duplicate"]);
    expect(prepared.records).toHaveLength(1);
    expect(prepared.records[0]?.amountMinor).toBe(-50_000);
    expect(prepared.duplicateCount).toBe(1);
  });

  it("marks a valid row as a duplicate when its fingerprint already exists", async () => {
    const csv = parseCsv(
      "Date,Description,Amount,Category\n2026-07-20,Weekly market,-500.00,Food & dining",
    );
    const withoutExisting = await prepareImportRows(
      csv,
      { ...mapping, kind: undefined },
      categories,
      new Set(),
      "user:user-1:account:default",
    );
    const fingerprint = withoutExisting.records[0]!.fingerprint;
    const withExisting = await prepareImportRows(
      csv,
      { ...mapping, kind: undefined },
      categories,
      new Set([fingerprint]),
      "user:user-1:account:default",
    );
    expect(withExisting.rows[0]?.status).toBe("duplicate");
    expect(withExisting.records).toHaveLength(0);
  });

  it("uses the tenant default account as the fingerprint source", async () => {
    const csv = parseCsv(
      "Date,Description,Amount,Category\n2026-07-20,Weekly market,-500.00,Food & dining",
    );
    const firstTenant = await prepareImportRows(
      csv,
      { ...mapping, kind: undefined },
      categories,
      new Set(),
      "user:user-1:account:default",
    );
    const secondTenant = await prepareImportRows(
      csv,
      { ...mapping, kind: undefined },
      categories,
      new Set(),
      "user:user-2:account:default",
    );
    expect(firstTenant.records[0]?.fingerprint).not.toBe(secondTenant.records[0]?.fingerprint);
  });

  it("rejects a mapped non-PHP currency", async () => {
    const csv = parseCsv(
      "Date,Description,Amount,Currency,Category\n2026-07-20,Market,-500.00,USD,Food & dining",
    );
    const prepared = await prepareImportRows(
      csv,
      { ...mapping, kind: undefined, currency: "Currency" },
      categories,
      new Set(),
      "user:user-1:account:default",
    );
    expect(prepared.rows[0]).toMatchObject({
      status: "invalid",
      errors: ["Currency must be PHP."],
    });
  });

  it("uses the kind-specific Uncategorized category when Category is omitted", async () => {
    const csv = parseCsv(
      [
        "Date,Description,Amount,Type",
        "2026-07-20,Refund,50.00,income",
        "2026-07-20,Market,-50.00,expense",
        "2026-07-20,Savings,50.00,transfer",
      ].join("\n"),
    );
    const prepared = await prepareImportRows(
      csv,
      { date: "Date", description: "Description", amount: "Amount", kind: "Type" },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.records.map((row) => row.categoryId)).toEqual([
      "uncategorized-income",
      "uncategorized-expense",
      "uncategorized-transfer",
    ]);
    expect(prepared.rows.every((row) => row.categoryName === "Uncategorized")).toBe(true);
  });

  it("falls back for blank, unknown, and wrong-kind category values", async () => {
    const csv = parseCsv(
      [
        "Date,Description,Amount,Category",
        "2026-07-20,Blank,-10.00,",
        "2026-07-20,Unknown,-20.00,Shopping",
        "2026-07-20,Wrong kind,-30.00,Salary",
      ].join("\n"),
    );
    const prepared = await prepareImportRows(
      csv,
      { date: "Date", description: "Description", amount: "Amount", category: "Category" },
      [
        ...uncategorizedCategories,
        {
          id: "salary",
          name: "Salary",
          kind: "income",
          color: "#2a78d6",
          archived: false,
          system: false,
        },
      ],
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.rows.map((row) => row.status)).toEqual(["ready", "ready", "ready"]);
    expect(prepared.records.every((row) => row.categoryId === "uncategorized-expense")).toBe(true);
  });

  it("applies one fallback date to every row before fingerprinting", async () => {
    const csv = parseCsv("Description,Amount\nMarket,-50.00\nSalary,100.00");
    const prepared = await prepareImportRows(
      csv,
      { description: "Description", amount: "Amount" },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
      "2026-07-21",
    );

    expect(prepared.records.map((row) => row.date)).toEqual(["2026-07-21", "2026-07-21"]);
    expect(prepared.records.map((row) => row.categoryId)).toEqual([
      "uncategorized-expense",
      "uncategorized-income",
    ]);
  });

  it("does not use the fallback date for invalid cells in a mapped Date column", async () => {
    const csv = parseCsv("Date,Description,Amount\n,Market,-50.00");
    const prepared = await prepareImportRows(
      csv,
      { date: "Date", description: "Description", amount: "Amount" },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.rows[0]).toMatchObject({
      status: "invalid",
      errors: ["Date must be a real YYYY-MM-DD or MM/DD/YYYY date."],
    });
  });

  it("combines Debit and Credit columns into signed amounts", async () => {
    const csv = parseCsv(
      [
        "Date,Description,Debit,Credit",
        "7/20/2026,Market,500.00,",
        "7/21/2026,Salary,,1000.00",
        "7/22/2026,Refund,-25.00,",
      ].join("\n"),
    );
    const prepared = await prepareImportRows(
      csv,
      { date: "Date", description: "Description", debit: "Debit", credit: "Credit" },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.records.map((row) => [row.date, row.amountMinor, row.kind])).toEqual([
      ["2026-07-20", -50_000, "expense"],
      ["2026-07-21", 100_000, "income"],
      ["2026-07-22", -2_500, "expense"],
    ]);
  });

  it("rejects rows with values in both or neither split amount column", async () => {
    const csv = parseCsv(
      ["Date,Description,Debit,Credit", "7/20/2026,Both,50.00,10.00", "7/21/2026,Neither,,0"].join(
        "\n",
      ),
    );
    const prepared = await prepareImportRows(
      csv,
      { date: "Date", description: "Description", debit: "Debit", credit: "Credit" },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.rows.every((row) => row.status === "invalid")).toBe(true);
    expect(prepared.rows.every((row) => row.errors[0]?.includes("either Debit or Credit"))).toBe(
      true,
    );
  });

  it("rejects a mapped type that conflicts with Debit or Credit", async () => {
    const csv = parseCsv("Date,Description,Debit,Credit,Type\n7/20/2026,Market,50.00,,income");
    const prepared = await prepareImportRows(
      csv,
      {
        date: "Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
        kind: "Type",
      },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.rows[0]).toMatchObject({
      status: "invalid",
      errors: ["Type must match whether the value is in Debit or Credit."],
    });
  });

  it("deduplicates equivalent ISO/signed and slash-date/split rows", async () => {
    const signed = await prepareImportRows(
      parseCsv("Date,Description,Amount\n2026-07-20,Market,-500.00"),
      { date: "Date", description: "Description", amount: "Amount" },
      uncategorizedCategories,
      new Set(),
      "user:user-1:account:default",
    );
    const split = await prepareImportRows(
      parseCsv("Date,Description,Debit,Credit\n7/20/2026,Market,500.00,"),
      { date: "Date", description: "Description", debit: "Debit", credit: "Credit" },
      uncategorizedCategories,
      new Set([signed.records[0]!.fingerprint]),
      "user:user-1:account:default",
    );

    expect(split.rows[0]?.status).toBe("duplicate");
    expect(split.records).toHaveLength(0);
  });

  it("marks only server-selected Uncategorized rows as eligible for category changes", async () => {
    const prepared = await prepareImportRows(
      parseCsv(
        "Date,Description,Amount,Category\n2026-07-20,Market,-50.00,\n2026-07-21,Dinner,-20.00,Food & dining",
      ),
      { date: "Date", description: "Description", amount: "Amount", category: "Category" },
      [...uncategorizedCategories, ...categories],
      new Set(),
      "user:user-1:account:default",
    );

    expect(prepared.rows.map((row) => [row.categoryId, row.categoryIsUncategorized])).toEqual([
      ["uncategorized-expense", true],
      ["food", false],
    ]);
    expect(prepared.records.map((row) => row.categoryIsUncategorized)).toEqual([true, false]);
  });
});

const preparedUncategorizedRow: PreparedImportRecord = {
  rowNumber: 2,
  date: "2026-07-20",
  description: "Market",
  amountMinor: -5_000,
  kind: "expense",
  categoryId: "uncategorized-expense",
  categoryName: "Uncategorized",
  categoryIsUncategorized: true,
  fingerprint: "fingerprint-1",
};

const foodOverrideCategory = {
  id: "food",
  name: "Food & dining",
  kind: "expense" as const,
  archived: false,
  systemKey: null,
};

describe("import category overrides", () => {
  it("replaces only the category while preserving transaction identity", () => {
    const rows = applyCategoryOverridesToRows(
      [preparedUncategorizedRow],
      [{ rowNumber: 2, categoryId: "food" }],
      [foodOverrideCategory],
    );

    expect(rows[0]).toEqual({
      ...preparedUncategorizedRow,
      categoryId: "food",
      categoryName: "Food & dining",
      categoryIsUncategorized: false,
    });
    expect(preparedUncategorizedRow.categoryId).toBe("uncategorized-expense");
    expect(rows[0]?.fingerprint).toBe(preparedUncategorizedRow.fingerprint);
  });

  it("rejects missing rows, inaccessible categories, archived, system, and wrong-kind targets", () => {
    const cases = [
      {
        rows: [preparedUncategorizedRow],
        override: { rowNumber: 99, categoryId: "food" },
        categories: [foodOverrideCategory],
      },
      {
        rows: [preparedUncategorizedRow],
        override: { rowNumber: 2, categoryId: "other-tenant" },
        categories: [foodOverrideCategory],
      },
      {
        rows: [preparedUncategorizedRow],
        override: { rowNumber: 2, categoryId: "food" },
        categories: [{ ...foodOverrideCategory, archived: true }],
      },
      {
        rows: [preparedUncategorizedRow],
        override: { rowNumber: 2, categoryId: "food" },
        categories: [{ ...foodOverrideCategory, systemKey: "uncategorized:expense" }],
      },
      {
        rows: [preparedUncategorizedRow],
        override: { rowNumber: 2, categoryId: "food" },
        categories: [{ ...foodOverrideCategory, kind: "income" as const }],
      },
      {
        rows: [{ ...preparedUncategorizedRow, categoryIsUncategorized: false }],
        override: { rowNumber: 2, categoryId: "food" },
        categories: [foodOverrideCategory],
      },
    ];

    for (const testCase of cases) {
      expect(
        captureError(() =>
          applyCategoryOverridesToRows(testCase.rows, [testCase.override], testCase.categories),
        ),
      ).toMatchObject({ status: 400, code: "invalid_category_override" });
    }
  });
});
