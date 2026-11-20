import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import type { Currency, CurrencyTotals } from "@zoption/shared";

import { BalanceAdjustCard } from "./BalanceAdjustCard";
import { emptyBalanceDraft, type BalanceDraft } from "./balance-adjustment";

const onDraft = jest.fn();

/** Holds the draft the way the account editor does. */
function Harness(props: {
  accountType: string;
  balancesByCurrency: CurrencyTotals;
  selectedCurrency?: Currency;
}) {
  const [draft, setDraft] = useState<BalanceDraft>(emptyBalanceDraft);
  return (
    <BalanceAdjustCard
      accountCurrency="PHP"
      draft={draft}
      onDraftChange={(next) => {
        onDraft(next);
        setDraft(next);
      }}
      {...props}
    />
  );
}

describe("BalanceAdjustCard", () => {
  beforeEach(() => onDraft.mockReset());

  it("drafts an opening USD balance in a PHP bank account", async () => {
    await render(<Harness accountType="checking" balancesByCurrency={{ PHP: 50_000 }} />);

    // The new-currency picker stays hidden until the user asks to add one.
    expect(screen.queryByRole("button", { name: "New currency" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add new currency" }));
    await fireEvent.press(screen.getByRole("button", { name: "New currency" }));
    // The sheet offers only currencies the account does not hold yet.
    expect(screen.queryByLabelText("Philippine Peso (PHP)")).toBeNull();
    await fireEvent.press(screen.getByLabelText("US Dollar (USD)"));
    await fireEvent.changeText(screen.getByPlaceholderText("0.00"), "120");

    expect(onDraft).toHaveBeenLastCalledWith({ adding: true, newCurrency: "USD", amount: "120" });
  });

  it("lists each held balance once, highlighting the one being adjusted", async () => {
    await render(
      <Harness
        accountType="savings"
        balancesByCurrency={{ PHP: 50_000, USD: 12_000 }}
        selectedCurrency="USD"
      />,
    );

    expect(screen.getByLabelText("Balances by currency")).toBeTruthy();
    expect(screen.getByText("PHP")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    // No separate "Current USD" line repeats the selected balance.
    expect(screen.queryByText(/Current/)).toBeNull();
    // The editor's Save changes books the change; the card has no button of its own.
    expect(screen.queryByRole("button", { name: "Adjust balance" })).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText("0.00"), "100");
    expect(screen.getByText(/120\.00 → 100\.00/)).toBeTruthy();
  });

  it("keeps a cash account in its own currency", async () => {
    await render(<Harness accountType="cash" balancesByCurrency={{ PHP: 50_000 }} />);

    expect(screen.queryByRole("button", { name: "Add new currency" })).toBeNull();
    expect(screen.getByText("PHP")).toBeTruthy();
  });
});
