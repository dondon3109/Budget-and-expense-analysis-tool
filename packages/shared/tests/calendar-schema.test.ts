import { describe, expect, it } from "vitest";

import { transactionCalendarQuerySchema } from "../src";

describe("transactionCalendarQuerySchema", () => {
  it("accepts the first day of a real month", () => {
    expect(transactionCalendarQuerySchema.parse({ month: "2026-07-01" })).toEqual({
      month: "2026-07-01",
    });
  });

  it.each(["2026-07-02", "2026-02-30", "July 2026"])("rejects %s", (month) => {
    expect(transactionCalendarQuerySchema.safeParse({ month }).success).toBe(false);
  });
});
