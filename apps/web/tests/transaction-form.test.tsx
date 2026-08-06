// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord, TransactionListItem } from "@zoption/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionForm } from "../src/components/transactions/TransactionForm";

const accounts = [
  {
    id: "account-everyday",
    name: "Everyday account",
    type: "checking" as const,
    currency: "PHP" as const,
    balanceMinor: null,
    balanceAsOf: null,
    archived: false,
  },
  {
    id: "account-savings",
    name: "Savings pocket",
    type: "savings" as const,
    currency: "PHP" as const,
    balanceMinor: null,
    balanceAsOf: null,
    archived: false,
  },
];

const category: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
  system: false,
  origin: "custom",
  requiredPlan: "free",
  locked: false,
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

  it("lets the user record a transaction in USD", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        categories={[category]}
        accounts={accounts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Amount (PHP)")).toBeInTheDocument();
    expect(screen.getByText("Philippine Peso (PHP)")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Currency"), "USD");
    expect(screen.getByLabelText("Amount (USD)")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("e.g. Weekly groceries"), "US store purchase");
    await user.type(screen.getByLabelText("Amount (USD)"), "100");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "USD", amountMinor: 10_000, categoryId: "food" }),
      ),
    );
  });

  it("marks expired-Pro categories unavailable and skips them for new transactions", () => {
    const lockedCategory: CategoryRecord = {
      ...category,
      id: "pro-food",
      name: "Pro food",
      requiredPlan: "zoption_pro",
      locked: true,
    };
    render(
      <TransactionForm
        categories={[lockedCategory, category]}
        accounts={accounts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Pro food — Pro required" })).toBeDisabled();
    expect(screen.getByLabelText("Category")).toHaveValue("food");
  });

  it("keeps a locked historical category selected for non-category edits", async () => {
    const user = userEvent.setup();
    const lockedCategory: CategoryRecord = {
      ...category,
      id: "pro-food",
      name: "Pro food",
      requiredPlan: "zoption_pro",
      locked: true,
    };
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        item={{ ...transaction, categoryId: lockedCategory.id, categoryName: lockedCategory.name }}
        categories={[lockedCategory]}
        accounts={accounts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Category")).toHaveValue("pro-food");
    expect(screen.getByRole("option", { name: "Pro food — Pro required" })).toBeDisabled();
    await user.clear(screen.getByLabelText(/Notes/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "pro-food", notes: "" }),
      ),
    );
  });
  it("makes description optional and submits a transfer fee for transfers", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    const transferCategory: CategoryRecord = {
      ...category,
      id: "transfer",
      name: "Transfer",
      kind: "transfer",
    };
    render(
      <TransactionForm
        categories={[transferCategory]}
        accounts={accounts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Transaction type"), "transfer");
    const descriptionInput = screen.getByLabelText(/Description/);
    expect(descriptionInput).not.toBeRequired();
    await user.selectOptions(screen.getByLabelText("To account"), "account-savings");
    await user.selectOptions(screen.getByLabelText("From account"), "account-everyday");
    await user.type(screen.getByLabelText("Amount (PHP)"), "100");
    await user.type(screen.getByLabelText("Transfer fee"), "10");

    const net = screen.getByRole("status");
    expect(net).toHaveTextContent(/Receiving account gets/);
    expect(net).toHaveTextContent(/after/);
    expect(net).toHaveTextContent(/10/);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "transfer",
          description: "",
          amountMinor: 10_000,
          transferFeeMinor: 1_000,
          fromAccountId: "account-everyday",
          toAccountId: "account-savings",
        }),
      ),
    );
  });
});
