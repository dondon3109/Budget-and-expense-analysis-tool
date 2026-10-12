import { describe, expect, it } from "vitest";

import { pinnedEntryCurrency } from "../src/accountTypes";

describe("pinnedEntryCurrency", () => {
  it("leaves the currency free when every account is a bank", () => {
    expect(
      pinnedEntryCurrency([
        { type: "checking", currency: "PHP" },
        { type: "savings", currency: "USD" },
      ]),
    ).toBeNull();
  });

  it("pins the entry to a non-bank account's currency on either side", () => {
    expect(pinnedEntryCurrency([{ type: "cash", currency: "USD" }])).toBe("USD");
    expect(
      pinnedEntryCurrency([
        { type: "checking", currency: "PHP" },
        { type: "ewallet", currency: "PHP" },
      ]),
    ).toBe("PHP");
  });

  it("ignores accounts that are not chosen yet", () => {
    expect(pinnedEntryCurrency([undefined, { type: "checking", currency: "PHP" }])).toBeNull();
  });
});
