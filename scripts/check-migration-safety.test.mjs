import { describe, expect, it } from "vitest";

import { destructiveLines } from "./check-migration-safety.mjs";

describe("destructiveLines", () => {
  it("finds DROP and RENAME in any case", () => {
    const sql =
      "ALTER TABLE a ADD COLUMN b text;\nalter table a drop column c;\nALTER TABLE a RENAME TO d;";
    expect(destructiveLines(sql).map((hit) => hit.line)).toEqual([2, 3]);
  });

  it("ignores line and block comments", () => {
    const sql = "-- DROP TABLE a;\n/* RENAME\n DROP */\nCREATE TABLE b (id text);";
    expect(destructiveLines(sql)).toEqual([]);
  });

  it("does not match words that merely contain the keyword", () => {
    expect(destructiveLines("CREATE TABLE dropoff (renamed_at text);")).toEqual([]);
  });
});
