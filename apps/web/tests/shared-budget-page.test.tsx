// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { encodeSharedBudgetToken, type SharedBudgetPayload } from "@zoption/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareBudgetModal } from "../src/components/budgets/ShareBudgetModal";
import { SharedBudgetPage } from "../src/pages/shared/SharedBudgetPage";

afterEach(cleanup);

const basePayload: SharedBudgetPayload = {
  version: 1,
  shareId: "share_123",
  title: "Family Budget - September 2026",
  month: "2026-09",
  currency: "PHP",
  envelopes: [
    {
      categoryId: "groceries",
      categoryName: "Groceries",
      categoryColor: "#22c55e",
      allocatedLimitMinor: 20_000,
      spentMinor: 7_500,
      remainingMinor: 12_500,
      percentUsed: 38,
    },
    {
      categoryId: "rent",
      categoryName: "Rent",
      categoryColor: "#6366f1",
      allocatedLimitMinor: 50_000,
      spentMinor: 50_000,
      remainingMinor: 0,
      percentUsed: 100,
    },
  ],
  totalAllocatedMinor: 70_000,
  totalSpentMinor: 57_500,
  totalRemainingMinor: 12_500,
  totalPercentUsed: 82,
  ownerDisplayName: "Don",
  notes: "Read this before the family check-in.",
  createdAt: "2026-09-03T12:00:00.000Z",
  expiresAt: "2099-09-10T12:00:00.000Z",
};

function renderSharedBudget(token: string) {
  render(
    <MemoryRouter initialEntries={[`/shared/budget/${token}`]}>
      <Routes>
        <Route path="/shared/budget/:token" element={<SharedBudgetPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SharedBudgetPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a valid shared budget token", () => {
    renderSharedBudget(encodeSharedBudgetToken(basePayload));

    expect(screen.getByRole("heading", { name: "Family Budget - September 2026" })).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Don")).toBeInTheDocument();
    expect(screen.getByText("Read this before the family check-in.")).toBeInTheDocument();
    expect(screen.getByText("This link expires Sep 10, 2099, 8:00 PM.")).toBeInTheDocument();
    expect(screen.getByText("Total Envelope Budget")).toBeInTheDocument();
    expect(screen.getByText("₱700")).toBeInTheDocument();
    expect(screen.getByText("Total Spent")).toBeInTheDocument();
    expect(screen.getByText("₱575")).toBeInTheDocument();
    expect(screen.getByText("Remaining Balance")).toBeInTheDocument();
    expect(screen.getAllByText("₱125").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Overall % Used")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is a secure, read-only budget snapshot. Personal bank details, account balances, and individual transactions are never shared.",
      ),
    ).toBeInTheDocument();
  });

  it("sets accessible progress values from envelope usage", () => {
    renderSharedBudget(encodeSharedBudgetToken(basePayload));

    expect(screen.getByRole("progressbar", { name: "Groceries budget used" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    expect(screen.getByRole("progressbar", { name: "Rent budget used" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("shows an expiration error for expired links", () => {
    const expiredPayload = {
      ...basePayload,
      expiresAt: "2020-01-01T00:00:00.000Z",
    } satisfies SharedBudgetPayload;

    renderSharedBudget(encodeSharedBudgetToken(expiredPayload));

    expect(screen.getByRole("alert")).toHaveTextContent("This shared budget link has expired");
    expect(screen.queryByText("Total Envelope Budget")).not.toBeInTheDocument();
  });

  it("shows a clear error for invalid links", () => {
    renderSharedBudget("not-a-token");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This shared budget link is invalid or incomplete",
    );
  });
});

describe("ShareBudgetModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates and copies a read-only share link", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub on navigator, so the
    // mock must be attached afterwards or the component never sees it.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText },
    });

    render(
      <ShareBudgetModal
        isOpen
        onClose={vi.fn()}
        month="2026-09"
        categories={[
          {
            id: "groceries",
            name: "Groceries",
            color: "#22c55e",
            allocatedLimitMinor: 20_000,
            spentMinor: 7_500,
          },
        ]}
      />,
    );

    expect(screen.getByDisplayValue("Family Budget - September 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate link" }));

    const link = screen.getByLabelText("Read-only link") as HTMLInputElement;
    expect(link.value).toContain("/shared/budget/zsb1.");

    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/shared/budget/zsb1."));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    Reflect.deleteProperty(navigator, "clipboard");
  });
});
