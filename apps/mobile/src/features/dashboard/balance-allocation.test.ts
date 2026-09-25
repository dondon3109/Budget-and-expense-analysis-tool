import type { AccountBalanceSummaryItem } from "@zoption/shared";

import { balanceAllocation } from "./balance-allocation";

function account(
  id: string,
  balanceMinor: number,
  overrides: Partial<AccountBalanceSummaryItem> = {},
): AccountBalanceSummaryItem {
  return {
    id,
    name: id,
    type: "checking",
    currency: "PHP",
    balanceMinor,
    balancesByCurrency: { PHP: balanceMinor, USD: 0 },
    archived: false,
    system: false,
    ...overrides,
  };
}

describe("balanceAllocation", () => {
  it("orders positive PHP balances largest first with their share of assets", () => {
    const result = balanceAllocation([account("cash", 25_00), account("bank", 75_00)]);

    expect(result.assetsMinor).toBe(100_00);
    expect(result.slices).toEqual([
      { id: "bank", name: "bank", balanceMinor: 75_00, sharePercent: 75 },
      { id: "cash", name: "cash", balanceMinor: 25_00, sharePercent: 25 },
    ]);
  });

  it("keeps debt, USD, and archived accounts out of the slices", () => {
    const result = balanceAllocation([
      account("bank", 50_00),
      account("card", -20_00, { type: "credit" }),
      account("usd", 10_00, { currency: "USD" }),
      account("old", 40_00, { archived: true }),
    ]);

    expect(result.slices.map((slice) => slice.id)).toEqual(["bank"]);
    expect(result.assetsMinor).toBe(50_00);
    expect(result.liabilitiesMinor).toBe(-20_00);
  });

  it("returns no slices when nothing holds a positive balance", () => {
    expect(balanceAllocation([account("empty", 0)])).toEqual({
      slices: [],
      assetsMinor: 0,
      liabilitiesMinor: 0,
    });
  });
});
