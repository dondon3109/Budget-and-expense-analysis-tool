import { parseCsv, type CategoryRecord } from "@budget/shared";
import { describe, expect, it } from "vitest";

import { assertImportFileSize, assertImportRowCount } from "../src/db/imports";
import { prepareImportRows } from "../src/imports/prepare";

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
  },
];

const mapping = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  kind: "Type",
  category: "Category",
};

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
    const prepared = await prepareImportRows(csv, mapping, categories, new Set());
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
    );
    const fingerprint = withoutExisting.records[0]!.fingerprint;
    const withExisting = await prepareImportRows(
      csv,
      { ...mapping, kind: undefined },
      categories,
      new Set([fingerprint]),
    );
    expect(withExisting.rows[0]?.status).toBe("duplicate");
    expect(withExisting.records).toHaveLength(0);
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
    );
    expect(prepared.rows[0]).toMatchObject({
      status: "invalid",
      errors: ["Currency must be PHP."],
    });
  });
});
