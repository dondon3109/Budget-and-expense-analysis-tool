import { describe, expect, it } from "vitest";

import type { ImportPresetId } from "../src/importPresets";
import {
  detectImportPreset,
  getImportPreset,
  importPresets,
  resolvePresetMapping,
} from "../src/importPresets";

const bpiHeaders = [
  "Date",
  "Branch",
  "Transaction Date",
  "Transaction Description",
  "Debit Amount",
  "Credit Amount",
  "Running Balance",
];

describe("import presets shared module", () => {
  it("detects BPI by filename hint", () => {
    expect(detectImportPreset("bpi-statement-january.csv", bpiHeaders).id).toBe("bpi");
  });

  it("detects BPI by signature alone", () => {
    const signature = ["Branch", "Transaction Description", "Debit Amount", "Credit Amount", "Running Balance"];
    expect(detectImportPreset("history.csv", signature).id).toBe("bpi");
  });

  it("falls back to the generic preset for unknown files", () => {
    expect(detectImportPreset("mystery.csv", ["Date", "Description", "Amount"]).id).toBe("generic");
  });

  it("detects MariBank by filename", () => {
    const headers = ["Transaction Time", "Transaction Details", "Transaction Amount", "Transaction Type"];
    expect(detectImportPreset("mari bank export.csv", headers).id).toBe("maribank");
  });

  it("resolves debit/credit mapping for BPI headers", () => {
    const resolved = resolvePresetMapping(bpiHeaders, getImportPreset("bpi"));
    expect(resolved.amountMode).toBe("debit-credit");
    expect(resolved.mapping).toMatchObject({
      date: "Transaction Date",
      description: "Transaction Description",
      debit: "Debit Amount",
      credit: "Credit Amount",
    });
  });

  it("resolves a single amount column when no split columns exist", () => {
    const resolved = resolvePresetMapping(
      ["Date", "Description", "Amount"],
      getImportPreset("bpi"),
    );
    expect(resolved.amountMode).toBe("amount");
    expect(resolved.mapping.amount).toBe("Amount");
  });

  it("never reuses the same column for two roles", () => {
    const resolved = resolvePresetMapping(
      ["Date", "Details", "Details"],
      getImportPreset("maribank"),
    );
    const values = Object.values(resolved.mapping).filter(Boolean);
    expect(new Set(values).size).toBe(values.length);
  });

  it("getImportPreset returns generic for auto and unknown ids", () => {
    expect(getImportPreset("auto").id).toBe("generic");
    expect(getImportPreset("does-not-exist" as ImportPresetId).id).toBe("generic");
  });

  it("starts with the generic preset and keeps it first", () => {
    expect(importPresets[0]!.id).toBe("generic");
  });
});
