import { entryAccountOrder, rowAccounts } from "./AccountIconPicker";

const accounts = ["cash", "bank", "gcash", "maya", "savings"].map((id) => ({ id }));

describe("rowAccounts", () => {
  it("shows every account when they fit", () => {
    expect(rowAccounts(accounts.slice(0, 4), "cash")).toEqual({
      shown: accounts.slice(0, 4),
      overflow: false,
    });
  });

  it("keeps the chosen account visible when the rest overflow", () => {
    const { shown, overflow } = rowAccounts(accounts, "savings");
    expect(overflow).toBe(true);
    expect(shown.map((account) => account.id)).toEqual(["cash", "bank", "savings"]);
  });
});

describe("entryAccountOrder", () => {
  it("puts cash, then GCash, then bank, then the rest in their given order", () => {
    const sorted = entryAccountOrder([
      { label: "Bank", type: "checking" as const },
      { label: "Card", type: "credit" as const },
      { label: "Cash", type: "cash" as const },
      { label: "GCash", type: "other" as const },
      { label: "Maya", type: "ewallet" as const },
      { label: "Savings", type: "savings" as const },
    ]);
    expect(sorted.map((account) => account.label)).toEqual([
      "Cash",
      "GCash",
      "Bank",
      "Savings",
      "Card",
      "Maya",
    ]);
  });
});
