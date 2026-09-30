// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PricingPage } from "../src/views/pricing/PricingPage";

function renderPricingPage() {
  return render(<PricingPage />);
}

afterEach(cleanup);

describe("PricingPage", () => {
  it("renders the pricing hero, plan cards, and comparison table", () => {
    renderPricingPage();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Clear, honest pricing\. Start for free, upgrade when ready\./i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: /Free Plan/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Zoption Pro/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Detailed Plan Comparison/i }),
    ).toBeInTheDocument();
  });

  it("ships both billing intervals in the HTML with monthly on show", () => {
    const { container } = renderPricingPage();

    expect(container.querySelector("[data-active-interval]")).toHaveAttribute(
      "data-active-interval",
      "month",
    );
    expect(screen.getByText("₱149")).toHaveAttribute("data-interval-only", "month");
    expect(screen.getByText("₱1,299")).toHaveAttribute("data-interval-only", "year");
    expect(screen.getByRole("radio", { name: /Monthly billing/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Annual billing/i })).toHaveAttribute(
      "data-interval-choice",
      "year",
    );
  });

  it("provides direct navigation and call-to-action links", () => {
    renderPricingPage();

    const signupLinks = screen.getAllByRole("link", {
      name: /Start free|Create free workspace|Start with Pro|Create your free workspace/i,
    });
    expect(signupLinks.length).toBeGreaterThan(0);
    expect(signupLinks[0]).toHaveAttribute("href", "https://app.zoption.site/signup");

    const apkLinks = screen.getAllByRole("link", {
      name: /Download Android APK|Android APK/i,
    });
    expect(apkLinks.length).toBeGreaterThan(0);
    expect(apkLinks[0]).toHaveAttribute("href", "/install");
  });

  it("displays breadcrumbs and customer support response time guidance", () => {
    renderPricingPage();

    expect(screen.getByRole("navigation", { name: /Breadcrumb/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /What is your customer support response time\?/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/responds within 24 to 48 business hours.*typically under 24 hours/i),
    ).toBeInTheDocument();
  });
});
