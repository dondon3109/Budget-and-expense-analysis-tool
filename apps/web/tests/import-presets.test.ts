import { describe, expect, it } from "vitest";

import {
  detectImportPreset,
  getImportPreset,
  resolvePresetMapping,
} from "../src/lib/importPresets";

describe("bank import presets", () => {
  it.each([
    ["bpi-export.csv", ["Transaction Date", "Transaction Description", "Debit", "Credit"], "bpi"],
    ["bdo-history.csv", ["Post Date", "Transaction Description", "Debit", "Credit"], "bdo"],
    ["maribank.csv", ["Transaction Time", "Transaction Details", "Amount"], "maribank"],
    ["BankofAmerica.csv", ["Date", "Description", "Amount", "Running Bal."], "bank-of-america"],
    ["Chase1234.csv", ["Details", "Posting Date", "Description", "Amount", "Type"], "jpmorgan"],
  ] as const)("detects %s without depending on column order", (fileName, headers, presetId) => {
    expect(detectImportPreset(fileName, [...headers]).id).toBe(presetId);
    expect(detectImportPreset(fileName, [...headers].reverse()).id).toBe(presetId);
  });

  it("maps BPI split columns and keeps the resolved columns editable", () => {
    const preset = getImportPreset("bpi");
    const resolved = resolvePresetMapping(
      ["Balance", "Credit", "Description", "Transaction Date", "Debit"],
      preset,
    );

    expect(resolved).toMatchObject({
      amountMode: "debit-credit",
      mapping: {
        date: "Transaction Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
      },
    });
  });

  it("uses distinct Chase description and type columns", () => {
    const resolved = resolvePresetMapping(
      ["Details", "Posting Date", "Description", "Amount", "Type", "Balance"],
      getImportPreset("jpmorgan"),
    );

    expect(resolved.mapping.description).toBe("Description");
    expect(resolved.mapping.kind).toBe("Type");
    expect(resolved.mapping.amount).toBe("Amount");
  });

  it("does not reuse a Details column for both Description and Type", () => {
    const resolved = resolvePresetMapping(
      ["Date", "Details", "Amount"],
      getImportPreset("generic"),
    );

    expect(resolved.mapping.description).toBe("Details");
    expect(resolved.mapping.kind).toBeUndefined();
  });

  it("falls back to Generic when detection is ambiguous", () => {
    expect(detectImportPreset("transactions.csv", ["Date", "Description", "Amount"]).id).toBe(
      "generic",
    );
  });
});
