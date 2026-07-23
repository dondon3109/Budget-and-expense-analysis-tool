// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord, TransactionListItem } from "@budget/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionForm } from "../src/components/transactions/TransactionForm";

const accounts = [
  { id: "account-everyday", name: "Everyday account", type: "checking" as const, archived: false },
  { id: "account-savings", name: "Savings pocket", type: "savings" as const, archived: false },
];

const category: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
  system: false,
};

afterEach(cleanup);

const transaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-20",
  description: "Weekend groceries",
  amountMinor: -125_050,
  currency: "PHP",
  kind: "expense",
  categoryId: "food",
  categoryName: "Food & dining",
  categoryColor: "#dc8b3f",
  accountId: "account-everyday",
  accountName: "Everyday account",
  notes: "Remove this note",
};

describe("TransactionForm", () => {
  it("prefills a new transaction with the selected calendar date", () => {
    render(
      <TransactionForm
        initialDate="2026-08-12"
        categories={[category]}
        accounts={accounts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-12");
  });

  it("keeps the existing date when editing even if an initial date is provided", () => {
    render(
      <TransactionForm
        item={transaction}
        initialDate="2026-08-12"
        categories={[category]}
        accounts={accounts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Date")).toHaveValue("2026-07-20");
  });

  it("submits normalized edits and preserves an intentional empty note", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        item={transaction}
        categories={[category]}
        accounts={accounts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText(/Notes/));
    await user.selectOptions(screen.getByLabelText("Account"), "account-savings");
    await user.clear(screen.getByPlaceholderText("0.00"));
    await user.type(screen.getByPlaceholderText("0.00"), "1300.25");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 130_025,
          notes: "",
          categoryId: "food",
          accountId: "account-savings",
        }),
      ),
    );
  });
});
