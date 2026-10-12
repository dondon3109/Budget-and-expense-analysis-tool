import { describe, expect, it } from "vitest";

import { heldCurrencies, pinnedEntryCurrency } from "../src/accountTypes";

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

describe("heldCurrencies", () => {
  it("lists the account's own currency first, then others with a balance", () => {
    expect(
      heldCurrencies({ currency: "PHP", balancesByCurrency: { USD: 12_000, PHP: 0, EUR: 0 } }),
    ).toEqual(["PHP", "USD"]);
  });

  it("holds only its own currency when it has no balances yet", () => {
    expect(heldCurrencies({ currency: "USD" })).toEqual(["USD"]);
  });
});
