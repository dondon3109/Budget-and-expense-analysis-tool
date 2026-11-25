// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FINANCE_GUIDES } from "@zoption/shared";
import { afterEach, describe, expect, it } from "vitest";

import { setupFilters } from "../src/client/site";
import { GuideDetailPage } from "../src/views/guides/GuideDetailPage";
import { GuidesIndexPage } from "../src/views/guides/GuidesIndexPage";

afterEach(cleanup);

describe("GuidesIndexPage", () => {
  it("renders the guides hub hero, breadcrumbs, and initial list of all guides", () => {
    render(<GuidesIndexPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Personal Finance & Budgeting Guides" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Practical guides for private budgeting, e-wallet tracking/i),
    ).toBeInTheDocument();

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(breadcrumbs).getByText("Personal Finance & Budgeting Guides")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // All guide cards should be rendered initially
    for (const guide of FINANCE_GUIDES) {
      expect(
        screen.getByRole("link", { name: (name) => name.includes(guide.title) }),
      ).toHaveAttribute("href", `/guides/${guide.slug}`);
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
      expect(screen.getByText(guide.description)).toBeInTheDocument();
    }
  });

  it("filters guides by category, keyword search, and empty state reset", () => {
    render(<GuidesIndexPage />);

    setupFilters();

    const categoryGroup = screen.getByRole("group", { name: "Filter guides by category" });
    const budgetingRadio = within(categoryGroup).getByRole("radio", { name: "Budgeting" });
    const subscriptionsRadio = within(categoryGroup).getByRole("radio", { name: "Subscriptions" });
    const allRadio = within(categoryGroup).getByRole("radio", { name: "All Guides" });

    expect(allRadio).toBeChecked();
    expect(allRadio.closest("label")).toHaveClass("active");

    // Filter by Subscriptions
    fireEvent.click(subscriptionsRadio);
    expect(subscriptionsRadio).toBeChecked();
    expect(allRadio).not.toBeChecked();

    const subscriptionGuides = FINANCE_GUIDES.filter((g) => g.category === "subscriptions");
    const nonSubscriptionGuides = FINANCE_GUIDES.filter((g) => g.category !== "subscriptions");

    for (const guide of subscriptionGuides) {
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
    }
    for (const guide of nonSubscriptionGuides) {
      expect(
        screen.queryByRole("heading", { level: 2, name: guide.title }),
      ).not.toBeInTheDocument();
    }

    // Filter by Budgeting
    fireEvent.click(budgetingRadio);
    expect(budgetingRadio).toBeChecked();
    const budgetingGuides = FINANCE_GUIDES.filter((g) => g.category === "budgeting");
    for (const guide of budgetingGuides) {
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
    }

    // Filter by keyword inside guide metadata and then hit empty state
    const search = screen.getByRole("searchbox", { name: "Search guides" });
    fireEvent.input(search, { target: { value: "gcash" } });
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "How to Track GCash & Maya Expenses Without Bank Linking",
      }),
    ).toBeInTheDocument();

    fireEvent.input(search, { target: { value: "zzzz-no-match" } });
    expect(screen.getByRole("heading", { level: 2, name: "No guides found" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(allRadio).toBeChecked();
    expect(search).toHaveValue("");
    for (const guide of FINANCE_GUIDES) {
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
    }
  });

  it("renders CTA links and legal footer with the guides link", () => {
    render(<GuidesIndexPage />);

    expect(screen.getByRole("link", { name: /Create your free workspace/i })).toHaveAttribute(
      "href",
      "https://app.zoption.site/signup",
    );
    expect(screen.getByRole("link", { name: "Get the Android app" })).toHaveAttribute(
      "href",
      "/install",
    );

    const legalFooterNav = screen.getByRole("navigation", { name: "Legal and privacy" });
    expect(within(legalFooterNav).getByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
  });
});

describe("GuideDetailPage", () => {
  it("renders the complete guide article for a valid slug", () => {
    const firstGuide = FINANCE_GUIDES[0];
    expect(firstGuide).toBeDefined();
    if (!firstGuide) {
      throw new Error("Expected at least one guide");
    }

    render(<GuideDetailPage guide={firstGuide} />);

    // Breadcrumbs
    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(breadcrumbs).getByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
    expect(within(breadcrumbs).getByText(firstGuide.title)).toHaveAttribute("aria-current", "page");

    // Header and meta
    expect(screen.getByRole("heading", { level: 1, name: firstGuide.title })).toBeInTheDocument();
    expect(screen.getByText(firstGuide.description)).toBeInTheDocument();
    expect(screen.getByText(`Last updated: ${firstGuide.updatedDate}`)).toBeInTheDocument();
    expect(screen.getByText(`By ${firstGuide.author}`)).toBeInTheDocument();
    expect(screen.getByText(`${firstGuide.readTimeMinutes} min read`)).toBeInTheDocument();
    expect(screen.getAllByText(firstGuide.category).length).toBeGreaterThan(0);

    // Back link
    expect(screen.getByRole("link", { name: "← Back to all guides" })).toHaveAttribute(
      "href",
      "/guides",
    );

    // Table of contents
    if (firstGuide.sections.length > 1) {
      const toc = screen.getByRole("navigation", { name: "Table of contents" });
      expect(toc).toBeInTheDocument();
      for (const section of firstGuide.sections) {
        expect(within(toc).getByText(new RegExp(section.title, "i"))).toBeInTheDocument();
      }
      if (firstGuide.faqs.length > 0) {
        expect(
          within(toc).getByRole("link", { name: /Frequently asked questions/i }),
        ).toHaveAttribute("href", "#frequently-asked-questions");
      }
    }

    // Sections and takeaways
    for (const section of firstGuide.sections) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
      expect(screen.getByText(section.content)).toBeInTheDocument();
      if (section.keyTakeaways) {
        for (const takeaway of section.keyTakeaways) {
          expect(screen.getByText(takeaway)).toBeInTheDocument();
        }
      }
    }

    // FAQs
    if (firstGuide.faqs.length > 0) {
      expect(
        screen.getByRole("heading", { level: 2, name: "Frequently asked questions" }),
      ).toBeInTheDocument();
      for (const faq of firstGuide.faqs) {
        expect(screen.getByRole("heading", { level: 3, name: faq.question })).toBeInTheDocument();
        expect(screen.getByText(faq.answer)).toBeInTheDocument();
      }
    }

    // Related guides prefer the same category first
    const sameCategory = FINANCE_GUIDES.filter(
      (g) => g.slug !== firstGuide.slug && g.category === firstGuide.category,
    );
    const otherGuides = FINANCE_GUIDES.filter(
      (g) => g.slug !== firstGuide.slug && g.category !== firstGuide.category,
    );
    const relatedGuides = [...sameCategory, ...otherGuides].slice(0, 2);
    if (relatedGuides.length > 0) {
      expect(
        screen.getByRole("heading", { level: 2, name: "More financial guides" }),
      ).toBeInTheDocument();
      for (const related of relatedGuides) {
        expect(screen.getByRole("heading", { level: 3, name: related.title })).toBeInTheDocument();
        expect(screen.getByText(related.description)).toBeInTheDocument();
      }
    }

    // CTA & Footer
    expect(screen.getByRole("link", { name: /Create your workspace/i })).toHaveAttribute(
      "href",
      "https://app.zoption.site/signup",
    );
    expect(screen.getByRole("link", { name: "Get the Android app" })).toHaveAttribute(
      "href",
      "/install",
    );
    const legalFooterNav = screen.getByRole("navigation", { name: "Legal and privacy" });
    expect(within(legalFooterNav).getByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
  });
});
