import { describe, expect, it } from "vitest";

import { normalizeImportDate } from "../src/importDate";

describe("import date normalization", () => {
  it("keeps ISO dates and normalizes U.S. slash dates", () => {
    expect(normalizeImportDate("2026-07-01")).toBe("2026-07-01");
    expect(normalizeImportDate("7/1/2026")).toBe("2026-07-01");
    expect(normalizeImportDate("07/01/2026")).toBe("2026-07-01");
  });

  it("normalizes supported 24-hour bank timestamps to their calendar date", () => {
    expect(normalizeImportDate("2026-07-01 14:30:45")).toBe("2026-07-01");
    expect(normalizeImportDate("7/1/2026 9:05")).toBe("2026-07-01");
    expect(normalizeImportDate("7/1/2026 24:00")).toBeUndefined();
  });

  it("validates leap days and calendar boundaries", () => {
    expect(normalizeImportDate("2/29/2024")).toBe("2024-02-29");
    expect(normalizeImportDate("2/29/2026")).toBeUndefined();
    expect(normalizeImportDate("4/31/2026")).toBeUndefined();
    expect(normalizeImportDate("13/1/2026")).toBeUndefined();
  });

  it("does not guess day-first or unsupported date formats", () => {
    expect(normalizeImportDate("31/01/2026")).toBeUndefined();
    expect(normalizeImportDate("2026/07/01")).toBeUndefined();
    expect(normalizeImportDate("July 1, 2026")).toBeUndefined();
  });
});
