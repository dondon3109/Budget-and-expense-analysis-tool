// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CustomerReview, CustomerReviewAdminDashboard } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: true,
  billingError: undefined as Error | undefined,
  refetchBilling: vi.fn(),
  getReviews: vi.fn(),
  updateStatus: vi.fn(),
  updateLineup: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "admin-1", email: "admin@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/hooks/useBillingSummary", () => ({
  useBillingSummary: () => ({
    isLoading: false,
    data: mocks.billingError ? undefined : { canManageSponsoredSeats: mocks.admin },
    error: mocks.billingError,
    refetch: mocks.refetchBilling,
  }),
}));

vi.mock("../src/lib/api", () => ({
  getAdminCustomerReviews: mocks.getReviews,
  updateAdminCustomerReviewStatus: mocks.updateStatus,
  updateAdminCustomerReviewLineup: mocks.updateLineup,
}));

import { AdminCustomerReviewsPage } from "../src/pages/AdminCustomerReviewsPage";

const baseReview: Pick<CustomerReview, "publishConsent" | "createdAt" | "updatedAt"> = {
  publishConsent: true,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

const pendingReview: CustomerReview = {
  ...baseReview,
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Morgan",
  rating: 5,
  review: "The monthly view finally makes my spending patterns easy to understand.",
  moderationStatus: "pending",
  featuredOrder: null,
};

const firstFeaturedReview: CustomerReview = {
  ...baseReview,
  id: "00000000-0000-4000-8000-000000000002",
  displayName: "Alex",
  rating: 5,
  review: "Zoption gives me a calm and complete view of every month.",
  moderationStatus: "published",
  featuredOrder: 1,
};

const secondFeaturedReview: CustomerReview = {
  ...baseReview,
  id: "00000000-0000-4000-8000-000000000003",
  displayName: "Taylor",
  rating: 4,
  review: "Budgets and recurring expenses are much easier to review together.",
  moderationStatus: "published",
  featuredOrder: 2,
};

const dashboard: CustomerReviewAdminDashboard = {
  items: [pendingReview, firstFeaturedReview, secondFeaturedReview],
  lineup: [firstFeaturedReview, secondFeaturedReview],
  summary: { total: 3, pending: 1, published: 2, hidden: 0, featured: 2 },
  page: 1,
  pageSize: 50,
  totalFiltered: 3,
  totalPages: 1,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin/reviews"]}>
        <AdminCustomerReviewsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminCustomerReviewsPage", () => {
  beforeEach(() => {
    mocks.admin = true;
    mocks.billingError = undefined;
    mocks.refetchBilling.mockReset();
    mocks.getReviews.mockReset().mockResolvedValue(dashboard);
    mocks.updateStatus.mockReset().mockResolvedValue({
      ...dashboard,
      items: [{ ...pendingReview, moderationStatus: "published" }, ...dashboard.items.slice(1)],
      summary: { ...dashboard.summary, pending: 0, published: 3 },
    });
    mocks.updateLineup.mockReset().mockResolvedValue(dashboard);
  });

  afterEach(cleanup);

  it("keeps the public lineup visible while moderating immutable customer wording", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Customer reviews" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Landing lineup" })).toBeInTheDocument();
    expect(screen.getAllByText(firstFeaturedReview.review)).toHaveLength(2);
    expect(screen.getByText(/customer wording is immutable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish review" }));

    await waitFor(() =>
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        { key: "user:admin-1", userId: "admin-1" },
        pendingReview.id,
        "published",
      ),
    );
  });

  it("reorders the landing lineup with keyboard-operable buttons", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Move Alex later" }));

    await waitFor(() =>
      expect(mocks.updateLineup).toHaveBeenCalledWith({ key: "user:admin-1", userId: "admin-1" }, [
        secondFeaturedReview.id,
        firstFeaturedReview.id,
      ]),
    );
  });

  it("opens lineup details even when that review is outside the current inbox page", async () => {
    mocks.getReviews.mockResolvedValue({
      ...dashboard,
      items: [pendingReview],
      totalFiltered: 1,
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "View review 1 from Alex" }));

    expect(screen.getByRole("heading", { name: "Alex" })).toBeInTheDocument();
    expect(screen.getByText(/position 1/i)).toBeInTheDocument();
  });

  it("loads the next server-backed inbox page", async () => {
    mocks.getReviews
      .mockResolvedValueOnce({
        ...dashboard,
        totalFiltered: 51,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        ...dashboard,
        page: 2,
        totalFiltered: 51,
        totalPages: 2,
      });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mocks.getReviews).toHaveBeenCalledWith(
        { key: "user:admin-1", userId: "admin-1" },
        expect.objectContaining({ page: 2, pageSize: 50 }),
      ),
    );
  });

  it("distinguishes an empty filter result from an empty review inbox", async () => {
    mocks.getReviews.mockResolvedValue({
      ...dashboard,
      items: [],
      totalFiltered: 0,
    });
    renderPage();

    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("No submitted reviews")).not.toBeInTheDocument();
  });

  it("does not load the review inbox for a non-administrator", () => {
    mocks.admin = false;
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Platform administrator access required" }),
    ).toBeInTheDocument();
    expect(mocks.getReviews).not.toHaveBeenCalled();
  });

  it("distinguishes an access lookup failure from an authorization denial", async () => {
    mocks.billingError = new Error("offline");
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Administrator access could not be checked" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetchBilling).toHaveBeenCalledOnce();
    expect(mocks.getReviews).not.toHaveBeenCalled();
  });
});
