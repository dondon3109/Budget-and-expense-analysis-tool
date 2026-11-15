import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { useLocalReferenceData, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { BalanceAdjustCard } from "./BalanceAdjustCard";

jest.mock("@/db/local-workspace-state", () => ({
  useLocalReferenceData: jest.fn(),
  useLocalWorkspace: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: () => ({ retry: jest.fn() }),
}));

const createTransaction = jest.fn();

describe("BalanceAdjustCard", () => {
  beforeEach(() => {
    createTransaction.mockReset().mockResolvedValue("tx-adjust");
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { transactionMutations: { createTransaction } } as unknown as LocalWorkspace,
    } as ReturnType<typeof useLocalWorkspace>);
    jest.mocked(useLocalReferenceData).mockReturnValue({
      data: {
        accounts: [],
        categories: [
          { id: "cat-income", name: "Uncategorized", kind: "income" },
          { id: "cat-expense", name: "Uncategorized", kind: "expense" },
        ],
      },
    } as unknown as ReturnType<typeof useLocalReferenceData>);
  });

  it("opens a USD balance in a PHP bank account", async () => {
    await render(
      <BalanceAdjustCard
        accountId="acc-bank"
        accountName="Bank"
        accountType="checking"
        accountCurrency="PHP"
        balancesByCurrency={{ PHP: 50_000 }}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add currency" }));
    await fireEvent.press(screen.getByRole("button", { name: "New currency" }));
    // The sheet offers only currencies the account does not hold yet.
    expect(screen.queryByLabelText("Philippine Peso (PHP)")).toBeNull();
    await fireEvent.press(screen.getByLabelText("US Dollar (USD)"));
    await fireEvent.changeText(screen.getByPlaceholderText("0.00"), "120");
    await fireEvent.press(screen.getByRole("button", { name: "Add USD balance" }));

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "income",
          accountId: "acc-bank",
          amountMinor: 12_000,
          currency: "USD",
        }),
      ),
    );
  });

  it("lists every currency a bank account holds", async () => {
    await render(
      <BalanceAdjustCard
        accountId="acc-bank"
        accountName="Bank"
        accountType="savings"
        accountCurrency="PHP"
        balancesByCurrency={{ PHP: 50_000, USD: 12_000 }}
      />,
    );

    expect(screen.getByLabelText("Balances by currency")).toBeTruthy();
    expect(screen.getByText("USD ")).toBeTruthy();
  });

  it("keeps a cash account in its own currency", async () => {
    await render(
      <BalanceAdjustCard
        accountId="acc-cash"
        accountName="Cash"
        accountType="cash"
        accountCurrency="PHP"
        balancesByCurrency={{ PHP: 50_000 }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add currency" })).toBeNull();
  });
});
