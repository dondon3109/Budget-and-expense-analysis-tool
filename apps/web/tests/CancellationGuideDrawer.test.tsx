// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CancellationGuideDrawer } from "../src/components/subscriptions/CancellationGuideDrawer";

afterEach(cleanup);

describe("CancellationGuideDrawer", () => {
  const sampleItem: SubscriptionMonthItem = {
    id: "sub-1",
    name: "Netflix Standard",
    amountMinor: 54900,
    currency: "PHP",
    billingCycle: "monthly",
    status: "active",
    categoryId: "cat-1",
    categoryName: "Entertainment",
    categoryColor: "#e11d48",
    accountId: null,
    accountName: null,
    billingDate: "2026-03-15",
    nextBillingDate: "2026-03-15",
    monthlyCostMinor: 54900,
  };

  it("does not render when closed or item is null", () => {
    const { container } = render(
      <CancellationGuideDrawer item={sampleItem} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders specific guide instructions and direct portal link for known providers", () => {
    render(<CancellationGuideDrawer item={sampleItem} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Netflix Standard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open official cancellation portal/i })).toHaveAttribute(
      "href",
      "https://www.netflix.com/youraccount",
    );
    expect(screen.getByText(/Billing Cutoff Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/Under the 'Membership & Billing' section/i)).toBeInTheDocument();
  });

  it("renders generic guide for unrecognized subscriptions", () => {
    const customItem: SubscriptionMonthItem = {
      ...sampleItem,
      name: "Random Boutique Gym 123",
    };
    render(<CancellationGuideDrawer item={customItem} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("General Cancellation Guidelines")).toBeInTheDocument();
    expect(screen.getByText(/Identify Billing Channel/i)).toBeInTheDocument();
  });

  it("calls onClose when close button or overlay is clicked", () => {
    const handleClose = vi.fn();
    render(<CancellationGuideDrawer item={sampleItem} isOpen={true} onClose={handleClose} />);

    fireEvent.click(screen.getByLabelText("Close cancellation drawer"));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("presentation"));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
