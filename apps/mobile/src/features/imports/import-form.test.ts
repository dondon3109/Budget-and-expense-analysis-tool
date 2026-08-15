import {
  buildImportPreviewRequest,
  importFileKind,
  initialMappingState,
  mappingProblems,
  presetForFile,
} from "./import-form";

const bpiCsv = [
  "Date,Branch,Transaction Date,Transaction Description,Debit Amount,Credit Amount,Running Balance",
  "2026-07-20,BGC,2026-07-20,Weekend groceries,1250.50,,8000",
].join("\n");

describe("mobile import form helpers", () => {
  it("recognizes supported file kinds", () => {
    expect(importFileKind("statement.csv")).toBe("csv");
    expect(importFileKind("STATEMENT.TXT")).toBe("csv");
    expect(importFileKind("history.xlsx")).toBe("workbook");
    expect(importFileKind("history.xls")).toBe("workbook");
    expect(importFileKind("photo.png")).toBe("unsupported");
  });

  it("detects bank presets from file names", () => {
    expect(presetForFile("bpi-january.csv", ["Transaction Date"]).id).toBe("bpi");
    expect(presetForFile("unrelated.csv", ["Date"]).id).toBe("generic");
  });

  it("resolves a debit/credit mapping for BPI headers", () => {
    const headers = [
      "Date",
      "Branch",
      "Transaction Date",
      "Transaction Description",
      "Debit Amount",
      "Credit Amount",
      "Running Balance",
    ];
    const state = initialMappingState("bpi-statement.csv", headers);
    expect(state.presetId).toBe("bpi");
    expect(state.mapping).toMatchObject({
      date: "Transaction Date",
      description: "Transaction Description",
      debit: "Debit Amount",
      credit: "Credit Amount",
    });
  });

  it("reports mapping problems before any network request", () => {
    const headers = ["Date", "Description", "Amount"];
    const state = initialMappingState("history.csv", headers);
    expect(mappingProblems(state, headers)).toEqual([]);
    expect(mappingProblems({ ...state, mapping: { description: "Description" } }, headers))
      .toContainEqual({
        path: "amount",
        message: "Choose one Amount column or both Debit and Credit columns.",
      });
    expect(
      mappingProblems(
        { ...state, mapping: { ...state.mapping, date: undefined }, fallbackDate: "" },
        headers,
      ),
    ).toContainEqual({
      path: "date",
      message: "Choose a Date column or enter one date for every row.",
    });
    expect(
      mappingProblems({ ...state, mapping: { ...state.mapping, kind: "Date" } }, headers),
    ).toContainEqual({
      path: "columns",
      message: "Each mapped field must use a different source column.",
    });
  });

  it("builds a server-ready preview request", () => {
    const headers = ["Date", "Description", "Amount"];
    const state = initialMappingState("history.csv", headers);
    const request = buildImportPreviewRequest("history.csv", bpiCsv, 1, state);
    expect(request.fileName).toBe("history.csv");
    expect(request.headerRowNumber).toBe(1);
    expect(request.mapping.date).toBe("Date");
    expect(request.fallbackDate).toBeUndefined();
  });

  it("uses the fallback date when no date column is mapped", () => {
    const headers = ["Description", "Amount"];
    const state = {
      ...initialMappingState("history.csv", headers),
      mapping: { description: "Description", amount: "Amount" },
      fallbackDate: "2026-07-20",
    };
    const request = buildImportPreviewRequest("history.csv", bpiCsv, 1, state);
    expect(request.fallbackDate).toBe("2026-07-20");
    expect(request.mapping.date).toBeUndefined();
  });

  it("rejects an incomplete request", () => {
    const state = {
      presetId: "generic" as const,
      mapping: { description: "Description" },
      fallbackDate: "",
    };
    expect(() =>
      buildImportPreviewRequest("history.csv", bpiCsv, 1, {
        ...state,
        mapping: { ...state.mapping, amount: "Amount", date: "Date" },
      }),
    ).not.toThrow();
    expect(() =>
      buildImportPreviewRequest("history.csv", bpiCsv, 1, state),
    ).toThrow("The import setup is incomplete.");
  });
});
