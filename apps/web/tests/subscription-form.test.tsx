// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@budget/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubscriptionForm } from "../src/components/subscriptions/SubscriptionForm";

afterEach(cleanup);

const categories: CategoryRecord[] = [
  {
    id: "entertainment",
    name: "Entertainment",
    kind: "expense",
    color: "#7363a6",
    archived: false,
    system: false,
  },
  {
    id: "salary",
    name: "Salary",
    kind: "income",
    color: "#2a78d6",
    archived: false,
    system: false,
  },
  {
    id: "old",
    name: "Archived expense",
    kind: "expense",
    color: "#eda100",
    archived: true,
    system: false,
  },
];

describe("SubscriptionForm", () => {
  it("shows the five requested fields and submits integer minor units", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <SubscriptionForm
        categories={categories}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Billing cycle")).toBeInTheDocument();
    expect(screen.getByLabelText("Next billing date")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Archived expense" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "Annual cloud storage");
    await user.type(screen.getByLabelText("Amount"), "1200.50");
    await user.selectOptions(screen.getByLabelText("Billing cycle"), "yearly");
    await user.clear(screen.getByLabelText("Next billing date"));
    await user.type(screen.getByLabelText("Next billing date"), "2026-08-15");
    await user.click(screen.getByRole("button", { name: "Add subscription" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Annual cloud storage",
        amountMinor: 120_050,
        billingCycle: "yearly",
        nextBillingDate: "2026-08-15",
        categoryId: "entertainment",
      }),
    );
  });

  it("does not submit a zero amount", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <SubscriptionForm
        categories={categories}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Invalid plan");
    await user.type(screen.getByLabelText("Amount"), "0");
    await user.click(screen.getByRole("button", { name: "Add subscription" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
