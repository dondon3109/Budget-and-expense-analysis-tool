import { rowAccounts } from "./AccountIconPicker";

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
