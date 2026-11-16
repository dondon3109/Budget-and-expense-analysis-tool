// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SITE_EVENT_NAME } from "../src/lib/siteEvents";
import { PUBLIC_ROUTE_METADATA, SITEMAP_ENTRIES } from "../src/seo/siteMetadata";
import {
  MAX_SUBSCRIPTIONS,
  SubscriptionCalculator,
} from "../src/views/tools/SubscriptionCalculator";
import {
  averageMonthlyMinor,
  subscriptionTotals,
  yearlyCostMinor,
} from "../src/views/tools/subscriptionCosts";

afterEach(cleanup);

describe("subscription costs", () => {
  it("turns every billing cycle into an exact yearly amount", () => {
    expect(yearlyCostMinor(14_900, "weekly")).toBe(774_800);
    expect(yearlyCostMinor(14_900, "monthly")).toBe(178_800);
    expect(yearlyCostMinor(14_900, "quarterly")).toBe(59_600);
    expect(yearlyCostMinor(14_900, "yearly")).toBe(14_900);
    expect(() => yearlyCostMinor(1.5, "monthly")).toThrow(RangeError);
    expect(() => yearlyCostMinor(-1, "monthly")).toThrow(RangeError);
  });

  it("averages a year over 12 months, rounding half up to the centavo", () => {
    expect(averageMonthlyMinor(129_900)).toBe(10_825);
    expect(averageMonthlyMinor(5)).toBe(0);
    expect(averageMonthlyMinor(6)).toBe(1);
    expect(averageMonthlyMinor(1_200)).toBe(100);
  });

  it("totals a mixed list without losing a centavo", () => {
    expect(
      subscriptionTotals([
        { amountMinor: 54_900, cycle: "monthly" },
        { amountMinor: 129_900, cycle: "yearly" },
        { amountMinor: 1, cycle: "weekly" },
      ]),
    ).toEqual({ yearlyMinor: 788_752, monthlyMinor: 65_729 });
  });
});

describe("SubscriptionCalculator", () => {
  function yearlyTotal() {
    const card = screen.getByRole("heading", { name: "Per year" }).closest("article");
    return within(card as HTMLElement).getByText(/₱/).textContent;
  }

  it("totals the example rows before anyone types", () => {
    render(<SubscriptionCalculator />);
    // (549 + 169 + 49 + 1,500) × 12 + 1,299 = 28,503
    expect(yearlyTotal()).toBe("₱28,503");
  });

  it("leaves an unfinished row out of the totals and says so", () => {
    render(<SubscriptionCalculator />);
    fireEvent.change(screen.getByLabelText("Amount for Gym membership"), {
      target: { value: "abc" },
    });

    expect(yearlyTotal()).toBe("₱10,503");
    expect(screen.getByText(/One row is left out of the totals/)).toBeInTheDocument();
  });

  it("adds and removes rows, up to the cap", () => {
    render(<SubscriptionCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Antivirus" }));
    expect(yearlyTotal()).toBe("₱27,204");

    for (let count = 4; count < MAX_SUBSCRIPTIONS; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add a subscription" }));
    }
    expect(screen.queryByRole("button", { name: "Add a subscription" })).toBeNull();
    expect(screen.getByText("That is the most this calculator holds.")).toBeInTheDocument();
  });

  it("announces use once and never what was typed", () => {
    const heard: unknown[] = [];
    const listener = vi.fn((event: Event) => heard.push((event as CustomEvent).detail));
    window.addEventListener(SITE_EVENT_NAME, listener);
    render(<SubscriptionCalculator />);
    fireEvent.change(screen.getByLabelText("Name of subscription 1"), {
      target: { value: "Secret service" },
    });
    fireEvent.change(screen.getByLabelText("Amount for Secret service"), {
      target: { value: "999" },
    });
    window.removeEventListener(SITE_EVENT_NAME, listener);

    expect(heard).toEqual(["subscription_calculator_used"]);
  });

  it("sends visitors to signup with their source", () => {
    render(<SubscriptionCalculator />);
    const cta = screen.getByRole("link", { name: /Track these renewals in Zoption/ });
    expect(cta).toHaveAttribute(
      "href",
      "https://app.zoption.site/signup?from=subscription-calculator",
    );
    expect(cta).toHaveAttribute("data-site-event", "subscription_calculator_signup_clicked");
  });
});

describe("subscription calculator route", () => {
  it("is indexable and listed in the sitemap", () => {
    expect(PUBLIC_ROUTE_METADATA["/tools/subscription-cost-calculator"].robots).toBe(
      "index,follow",
    );
    expect(SITEMAP_ENTRIES.map((entry) => entry.path)).toContain(
      "/tools/subscription-cost-calculator",
    );
  });
});
