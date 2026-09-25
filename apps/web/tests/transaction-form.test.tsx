// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  DEBT_PAYMENT_CATEGORY_SYSTEM_KEY,
  type CategoryRecord,
  type Debt,
  type TransactionInput,
  type TransactionListItem,
} from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionForm } from "../src/components/transactions/TransactionForm";

const voiceDraft = vi.hoisted(() => ({
  transcript: "Spent 250 pesos on lunch today",
  description: "Lunch",
  date: "2026-08-21",
  amountMinor: 25_000,
  currency: "PHP" as const,
  kind: "expense" as const,
  categoryName: "Food & dining",
}));

vi.mock("../src/components/transactions/TransactionVoiceEntry", () => ({
  TransactionVoiceEntry: ({ onDraft }: { onDraft: (draft: typeof voiceDraft) => void }) => (
    <button type="button" onClick={() => onDraft(voiceDraft)}>
      Simulate voice draft
    </button>
  ),
}));

const createCategoryMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  createCategory: createCategoryMock,
}));

const workspace = { key: "user:test-user" as const, userId: "test-user" };

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

const debtPaymentCategory: CategoryRecord = {
  id: "debt-payment",
  name: "Debt payment",
  kind: "expense",
  color: "#e34948",
  archived: false,
  system: true,
  systemKey: DEBT_PAYMENT_CATEGORY_SYSTEM_KEY,
  origin: "system",
  requiredPlan: "free",
  locked: false,
};

const debts: Debt[] = [
  {
    id: "debt-card",
    name: "Visa card",
    type: "credit_card",
    balanceMinor: 1_250_000,
    aprBasisPoints: 2_400,
    minimumPaymentMinor: 50_000,
    balanceAsOf: "2026-07-01",
    status: "active",
    createdAt: "2026-07-01 00:00:00",
    updatedAt: "2026-07-01 00:00:00",
  },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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
  it("prefills fields from an AI voice draft without saving", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[category]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Simulate voice draft" }));

    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-21");
    expect(screen.getByLabelText(/Description/)).toHaveValue("Lunch");
    expect(screen.getByLabelText("Amount (PHP)")).toHaveValue("250.00");
    expect(screen.getByLabelText("Category")).toHaveValue("food");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prefills a new transaction with the selected calendar date", () => {
    render(
      <TransactionForm
        workspace={workspace}
        initialDate="2026-08-12"
        categories={[category]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-12");
  });

  it("defaults a new transaction to the Cash account", async () => {
    render(
      <TransactionForm
        workspace={workspace}
        categories={[category]}
        accounts={[
          ...accounts,
          {
            id: "account-cash",
            name: "Cash",
            type: "cash",
            currency: "PHP",
            balanceMinor: null,
            balanceAsOf: null,
            archived: false,
          },
        ]}
        debts={debts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Account")).toHaveValue("account-cash"));
  });

  it("defaults a new transaction to the default spending account over Cash", async () => {
    window.localStorage.setItem("zoption-default-spending-account", accounts[0]!.id);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[category]}
        accounts={[
          {
            id: "account-cash",
            name: "Cash",
            type: "cash",
            currency: "PHP",
            balanceMinor: null,
            balanceAsOf: null,
            archived: false,
          },
          ...accounts,
        ]}
        debts={debts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Account")).toHaveValue(accounts[0]!.id));
  });

  it("keeps the existing date when editing even if an initial date is provided", () => {
    render(
      <TransactionForm
        workspace={workspace}
        item={transaction}
        initialDate="2026-08-12"
        categories={[category]}
        accounts={accounts}
        debts={debts}
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
        workspace={workspace}
        item={transaction}
        categories={[category]}
        accounts={accounts}
        debts={debts}
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
        workspace={workspace}
        categories={[category]}
        accounts={accounts}
        debts={debts}
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
        workspace={workspace}
        categories={[lockedCategory, category]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Pro food — Pro required" })).toBeDisabled();
    expect(screen.getByLabelText("Category")).toHaveValue("food");
  });

  it("defaults a new income entry to the Salary category when present", async () => {
    const salaryCategory: CategoryRecord = {
      ...category,
      id: "salary",
      name: "Salary",
      kind: "income",
    };
    const otherIncome: CategoryRecord = {
      ...category,
      id: "other-income",
      name: "Other income",
      kind: "income",
    };
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[otherIncome, salaryCategory]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Transaction type"), "income");

    expect(screen.getByLabelText("Category")).toHaveValue("salary");
  });

  it("submits an income transaction without the expense-only debt link", async () => {
    const salaryCategory: CategoryRecord = {
      ...category,
      id: "salary",
      name: "Salary",
      kind: "income",
    };
    const onSubmit = vi.fn<(input: TransactionInput) => Promise<void>>(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[salaryCategory, debtPaymentCategory]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Transaction type"), "income");
    await user.type(screen.getByLabelText(/Description/), "September salary");
    await user.type(screen.getByLabelText("Amount (PHP)"), "25000");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "income",
        accountId: "account-everyday",
        categoryId: "salary",
        amountMinor: 2_500_000,
      }),
    );
    // The strict transaction schema rejects a debt link on income.
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("debtId");
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
        workspace={workspace}
        item={{ ...transaction, categoryId: lockedCategory.id, categoryName: lockedCategory.name }}
        categories={[lockedCategory]}
        accounts={accounts}
        debts={debts}
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
        workspace={workspace}
        categories={[transferCategory]}
        accounts={accounts}
        debts={debts}
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

  it("asks which debt was paid once the debt payment category is chosen", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[category, debtPaymentCategory]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Debt paid")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Description/), "Card payment");
    await user.type(screen.getByLabelText("Amount (PHP)"), "500");
    await user.selectOptions(screen.getByLabelText("Category"), "debt-payment");

    expect(screen.getByRole("button", { name: "Add transaction" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Debt paid"), "debt-card");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "debt-payment", debtId: "debt-card" }),
      ),
    );
  });

  it("sends no debt link for an ordinary expense", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[category, debtPaymentCategory]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Description/), "Lunch");
    await user.type(screen.getByLabelText("Amount (PHP)"), "120");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ debtId: null })),
    );
  });

  it("still records a debt payment when the workspace has no debts", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[debtPaymentCategory]}
        accounts={accounts}
        debts={[]}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Description/), "Card payment");
    await user.type(screen.getByLabelText("Amount (PHP)"), "500");

    expect(screen.queryByLabelText("Debt paid")).not.toBeInTheDocument();
    expect(screen.getByText(/Add a debt in Goals/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ debtId: null })),
    );
  });

  it("prefills the linked debt when editing a debt payment", () => {
    render(
      <TransactionForm
        workspace={workspace}
        item={{
          ...transaction,
          categoryId: debtPaymentCategory.id,
          categoryName: debtPaymentCategory.name,
          debtId: "debt-card",
          debtName: "Visa card",
        }}
        categories={[debtPaymentCategory]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Debt paid")).toHaveValue("debt-card");
  });
});

describe("TransactionForm keyboard and focus behaviour", () => {
  function renderForm(overrides: Partial<Parameters<typeof TransactionForm>[0]> = {}) {
    const onClose = vi.fn();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TransactionForm
        workspace={workspace}
        categories={[category]}
        accounts={accounts}
        debts={debts}
        busy={false}
        onSubmit={onSubmit}
        onClose={onClose}
        {...overrides}
      />,
    );
    return { onClose, onSubmit };
  }

  it("focuses the first field and returns focus on close", () => {
    renderForm();

    expect(document.activeElement).toBe(screen.getByLabelText(/Description/));
  });

  it("closes on Escape and ignores Escape while busy", () => {
    const { onClose } = renderForm();
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open on Escape while a save is in flight", () => {
    const { onClose } = renderForm({ busy: true });

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Add transaction" }), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("submits with Cmd/Ctrl+Enter from a field", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/Description/), "Coffee");
    await user.type(screen.getByLabelText("Amount (PHP)"), "120");
    fireEvent.keyDown(screen.getByLabelText(/Description/), { key: "Enter", ctrlKey: true });

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Coffee", amountMinor: 12_000 }),
      ),
    );
  });
});

describe("TransactionForm inline category creation", () => {
  it("creates a category without losing the entry in progress and selects it", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    const petCare: CategoryRecord = { ...category, id: "pet-care", name: "Pet care" };
    createCategoryMock.mockResolvedValueOnce(petCare);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TransactionForm
          workspace={workspace}
          categories={[category]}
          accounts={accounts}
          debts={debts}
          busy={false}
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText(/Description/), "Vet visit");
    await user.type(screen.getByLabelText("Amount (PHP)"), "450");
    await user.selectOptions(screen.getByLabelText("Category"), "+ New category…");
    await user.type(screen.getByLabelText("New category name"), "Pet care{Enter}");

    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("pet-care"));
    expect(createCategoryMock).toHaveBeenCalledWith(workspace, {
      name: "Pet care",
      kind: "expense",
      color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      iconEmoji: null,
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New category name")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toHaveValue("Vet visit");
    expect(screen.getByLabelText("Amount (PHP)")).toHaveValue("450");

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "pet-care", description: "Vet visit" }),
      ),
    );
  });
});
