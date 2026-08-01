// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { TransactionPage } from "@zoption/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardTransactionHistory } from "../src/components/dashboard/DashboardTransactionHistory";

const transactionPage: TransactionPage = {
  items: [
    {
      id: "last-month-income",
      date: "2026-07-14",
      description: "July salary",
      amountMinor: 85_000,
      currency: "PHP",
      kind: "income",
      categoryId: "income",
      categoryName: "Salary",
      categoryColor: "#3f8f74",
      accountId: "bank",
      accountName: "Bank",
      notes: null,
    },
    {
      id: "last-month-transfer",
      date: "2026-07-13",
      description: "Cash top-up",
      amountMinor: 2_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer",
      categoryName: "Transfer",
      categoryColor: "#61717a",
      accountId: "cash",
      accountName: "Cash",
      notes: null,
      fromAccountName: "Bank",
      toAccountName: "Cash",
    },
  ],
  page: 1,
  pageSize: 8,
  total: 10,
  totalPages: 2,
};

function renderHistory(overrides: Partial<ComponentProps<typeof DashboardTransactionHistory>> = {}) {
  const props: ComponentProps<typeof DashboardTransactionHistory> = {
    page: transactionPage,
    isPending: false,
    isFetching: false,
    error: null,
    onRetry: vi.fn(),
    onPageChange: vi.fn(),
    ...overrides,
  };

  return {
    ...render(
      <MemoryRouter>
        <DashboardTransactionHistory {...props} />
      </MemoryRouter>,
    ),
    props,
  };
}

afterEach(cleanup);

describe("DashboardTransactionHistory", () => {
  it("shows all-time records, including prior-month transfers, and links to record management", () => {
    renderHistory();

    expect(screen.getByRole("heading", { name: "Every transaction, in one place" })).toBeInTheDocument();
    expect(screen.getByText("July salary")).toBeInTheDocument();
    expect(screen.getByText("Bank → Cash")).toBeInTheDocument();
    expect(screen.getByText("10 transactions across your full history")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open transactions" })).toHaveAttribute(
      "href",
      "/app/transactions",
    );
  });

  it("requests the next page and disables unavailable pagination controls", () => {
    const { props } = renderHistory();

    expect(screen.getByRole("button", { name: "Previous transaction history page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next transaction history page" }));
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders loading, error retry, and empty states", () => {
    const { rerender, props } = renderHistory({ page: undefined, isPending: true });
    expect(screen.getByText("Loading your transaction history…")).toBeInTheDocument();

    const retry = vi.fn();
    rerender(
      <MemoryRouter>
        <DashboardTransactionHistory
          page={undefined}
          isPending={false}
          isFetching={false}
          error={new Error("Network unavailable")}
          onRetry={retry}
          onPageChange={props.onPageChange}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <DashboardTransactionHistory
          page={{ items: [], page: 1, pageSize: 8, total: 0, totalPages: 1 }}
          isPending={false}
          isFetching={false}
          error={null}
          onRetry={retry}
          onPageChange={props.onPageChange}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a transaction" })).toHaveAttribute(
      "href",
      "/app/transactions",
    );
  });
});
