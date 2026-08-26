import { render, screen } from "@testing-library/react-native";

import type { TransactionListItem } from "@zoption/shared";
import { TransactionRow } from "./TransactionRow";

const transaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-08-14",
  description: "Lunch",
  amountMinor: -12_345,
  currency: "PHP",
  kind: "expense",
  categoryId: "category-1",
  categoryName: "Food & dining",
  categoryColor: "#123456",
  accountId: "account-1",
  accountName: "Wallet",
  notes: null,
  transferGroupId: null,
  fromAccountId: null,
  fromAccountName: null,
  toAccountId: null,
  toAccountName: null,
  transferFeeMinor: null,
  legacyTransfer: false,
};

describe("TransactionRow", () => {
  it("announces the financial amount when the row becomes an action", async () => {
    await render(<TransactionRow transaction={transaction} pending onPress={jest.fn()} />);
    expect(
      screen.getByRole("button", {
        name: "Lunch, Food & dining, 2026-08-14, negative 123.45 Philippine pesos",
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/Saved on this device/)).toBeOnTheScreen();
  });

  it("distinguishes a failed operation from ordinary pending sync", async () => {
    await render(<TransactionRow transaction={transaction} failed onPress={jest.fn()} />);
    expect(screen.getByText(/Sync needs repair/)).toBeOnTheScreen();
    expect(screen.queryByText(/Saved on this device/)).not.toBeOnTheScreen();
  });

  it("renders the category emoji icon when present", async () => {
    await render(
      <TransactionRow
        transaction={{ ...transaction, categoryIconEmoji: "🍔" }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("🍔", { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
