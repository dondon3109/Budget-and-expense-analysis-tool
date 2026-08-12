// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCustomerReviewState: vi.fn(),
  saveCustomerReview: vi.fn(),
}));

vi.mock("../src/lib/api", () => api);

import { CustomerReviewPrompt } from "../src/components/reviews/CustomerReviewPrompt";

const user = {
  id: "user-1",
  email: "don@example.com",
  user_metadata: { display_name: "Don" },
} as unknown as User;
const workspace = { key: "user:user-1" as const, userId: "user-1" };

function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerReviewPrompt user={user} workspace={workspace} />
    </QueryClientProvider>,
  );
}

describe("customer review prompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.getCustomerReviewState.mockResolvedValue({ review: null, promptEligible: true });
    api.saveCustomerReview.mockResolvedValue({
      id: "review-1",
      displayName: "Don",
      rating: 5,
      review: "Zoption makes my monthly spending much easier to understand.",
      publishConsent: true,
      moderationStatus: "pending",
      featuredOrder: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("publishes only after a rating, meaningful review, and public consent", async () => {
    const userActions = userEvent.setup();
    renderPrompt();

    expect(await screen.findByRole("dialog", { name: /how is zoption working/i })).toBeVisible();
    expect(screen.getByText(/does not use AI to rewrite it/i)).toBeInTheDocument();
    await userActions.click(screen.getByRole("button", { name: "5 stars" }));
    await userActions.type(
      screen.getByRole("textbox", { name: /your experience/i }),
      "Zoption makes my monthly spending much easier to understand.",
    );
    const submitButton = screen.getByRole("button", { name: "Submit review" });
    expect(submitButton).toBeDisabled();
    await userActions.click(
      screen.getByRole("checkbox", { name: /may show this review and public name/i }),
    );
    await userActions.click(submitButton);

    await waitFor(() =>
      expect(api.saveCustomerReview).toHaveBeenCalledWith(
        workspace,
        expect.objectContaining({
          displayName: "Don",
          rating: 5,
          publishConsent: true,
        }),
      ),
    );
    expect(await screen.findByText("Thank you for sharing.")).toBeInTheDocument();
    expect(screen.getByText(/appear only if the zoption team selects it/i)).toBeInTheDocument();
  });

  it("snoozes a dismissed prompt for thirty days", async () => {
    const userActions = userEvent.setup();
    renderPrompt();
    await userActions.click(
      await screen.findByRole("button", { name: /remind me about reviewing zoption later/i }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(Number(window.localStorage.getItem("zoption:review-reminder:user-1"))).toBeGreaterThan(
      Date.now(),
    );
  });
});
