// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CustomerReview } from "@zoption/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  deleteCustomerReview: vi.fn(),
  getCustomerReviewState: vi.fn(),
  saveCustomerReview: vi.fn(),
}));

vi.mock("../src/lib/api", () => api);

import { CustomerReviewSettings } from "../src/components/reviews/CustomerReviewSettings";

const workspace = { key: "user:user-1" as const, userId: "user-1" };
const review: CustomerReview = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Don",
  rating: 5,
  review: "Zoption makes my monthly spending much easier to understand.",
  publishConsent: true,
  moderationStatus: "published",
  featuredOrder: 1,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

describe("CustomerReviewSettings", () => {
  beforeEach(() => {
    api.getCustomerReviewState.mockReset().mockResolvedValue({ review, promptEligible: false });
    api.saveCustomerReview.mockReset().mockResolvedValue({
      ...review,
      moderationStatus: "pending",
      featuredOrder: null,
    });
    api.deleteCustomerReview.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("lets a customer replace wording and explains the moderation reset", async () => {
    const user = userEvent.setup();
    render(<CustomerReviewSettings workspace={workspace} />);

    expect(await screen.findByText(/does not rewrite it with AI/i)).toBeInTheDocument();
    const experience = await screen.findByRole("textbox", { name: /Your experience/ });
    await user.clear(experience);
    await user.type(experience, "I updated my review and want the new wording checked before use.");
    await user.click(screen.getByRole("button", { name: "Save replacement review" }));

    await waitFor(() =>
      expect(api.saveCustomerReview).toHaveBeenCalledWith(
        workspace,
        expect.objectContaining({
          review: "I updated my review and want the new wording checked before use.",
          publishConsent: true,
        }),
      ),
    );
    expect(
      await screen.findByText(/returned to Zoption for publication review/i),
    ).toBeInTheDocument();
  });

  it("requires confirmation before permanently removing a review", async () => {
    const user = userEvent.setup();
    render(<CustomerReviewSettings workspace={workspace} />);

    await user.click(await screen.findByRole("button", { name: "Remove review" }));
    expect(api.deleteCustomerReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove permanently" }));

    await waitFor(() => expect(api.deleteCustomerReview).toHaveBeenCalledWith(workspace));
    expect(await screen.findByText("No customer review submitted")).toBeInTheDocument();
  });
});
