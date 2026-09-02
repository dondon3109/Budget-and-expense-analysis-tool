// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FINANCE_GUIDES, getFinanceGuideBySlug } from "@zoption/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { GuideDetailPage } from "../src/pages/guides/GuideDetailPage";
import { GuidesIndexPage } from "../src/pages/guides/GuidesIndexPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderWithProviders(element: React.ReactNode, initialEntries = ["/"]) {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={initialEntries}>{element}</MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("GuidesIndexPage", () => {
  it("renders the guides hub hero, breadcrumbs, and initial list of all guides", () => {
    renderWithProviders(<GuidesIndexPage />, ["/guides"]);

    expect(
      screen.getByRole("heading", { level: 1, name: "Personal Finance & Budgeting Guides" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/In-depth tutorials and actionable strategies for private budgeting/i),
    ).toBeInTheDocument();

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(
      within(breadcrumbs).getByText("Personal Finance & Budgeting Guides"),
    ).toHaveAttribute("aria-current", "page");

    // All guide cards should be rendered initially
    for (const guide of FINANCE_GUIDES) {
      expect(screen.getByRole("link", { name: `Read guide: ${guide.title}` })).toHaveAttribute(
        "href",
        `/guides/${guide.slug}`,
      );
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
      expect(screen.getByText(guide.description)).toBeInTheDocument();
    }
  });

  it("filters guides by category and allows returning to all guides", () => {
    renderWithProviders(<GuidesIndexPage />, ["/guides"]);

    const categoryNav = screen.getByRole("navigation", { name: "Filter guides by category" });
    const budgetingButton = within(categoryNav).getByRole("button", { name: "Budgeting" });
    const subscriptionsButton = within(categoryNav).getByRole("button", { name: "Subscriptions" });
    const allButton = within(categoryNav).getByRole("button", { name: "All Guides" });

    expect(allButton).toHaveAttribute("aria-pressed", "true");
    expect(allButton).toHaveClass("active");

    // Filter by Subscriptions
    fireEvent.click(subscriptionsButton);
    expect(subscriptionsButton).toHaveAttribute("aria-pressed", "true");
    expect(allButton).toHaveAttribute("aria-pressed", "false");

    const subscriptionGuides = FINANCE_GUIDES.filter((g) => g.category === "subscriptions");
    const nonSubscriptionGuides = FINANCE_GUIDES.filter((g) => g.category !== "subscriptions");

    for (const guide of subscriptionGuides) {
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
    }
    for (const guide of nonSubscriptionGuides) {
      expect(screen.queryByRole("heading", { level: 2, name: guide.title })).not.toBeInTheDocument();
    }

    // Filter by Budgeting
    fireEvent.click(budgetingButton);
    expect(budgetingButton).toHaveAttribute("aria-pressed", "true");
    const budgetingGuides = FINANCE_GUIDES.filter((g) => g.category === "budgeting");
    for (const guide of budgetingGuides) {
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
    }

    // Return to All Guides
    fireEvent.click(allButton);
    expect(allButton).toHaveAttribute("aria-pressed", "true");
    for (const guide of FINANCE_GUIDES) {
      expect(screen.getByRole("heading", { level: 2, name: guide.title })).toBeInTheDocument();
    }
  });

  it("renders CTA links and legal footer with the guides link", () => {
    renderWithProviders(<GuidesIndexPage />, ["/guides"]);

    expect(
      screen.getByRole("link", { name: /Create your free workspace/i }),
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("link", { name: "Download Android Beta APK" }),
    ).toHaveAttribute("href", "/install");

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

    renderWithProviders(
      <Routes>
        <Route path="/guides/:slug" element={<GuideDetailPage />} />
      </Routes>,
      [`/guides/${firstGuide.slug}`],
    );

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

    // Related guides
    const relatedGuides = FINANCE_GUIDES.filter((g) => g.slug !== firstGuide.slug).slice(0, 2);
    if (relatedGuides.length > 0) {
      expect(screen.getByRole("heading", { level: 2, name: "More financial guides" })).toBeInTheDocument();
      for (const related of relatedGuides) {
        expect(screen.getByRole("heading", { level: 3, name: related.title })).toBeInTheDocument();
        expect(screen.getByText(related.description)).toBeInTheDocument();
      }
    }

    // CTA & Footer
    expect(screen.getByRole("link", { name: /Create your workspace/i })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByRole("link", { name: "Download Android Beta APK" })).toHaveAttribute(
      "href",
      "/install",
    );
    const legalFooterNav = screen.getByRole("navigation", { name: "Legal and privacy" });
    expect(within(legalFooterNav).getByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
  });

  it("supports slug passed via props directly", () => {
    const targetGuide = FINANCE_GUIDES[1];
    expect(targetGuide).toBeDefined();
    if (!targetGuide) {
      throw new Error("Expected target guide");
    }

    renderWithProviders(<GuideDetailPage slug={targetGuide.slug} />, ["/any-route"]);

    expect(screen.getByRole("heading", { level: 1, name: targetGuide.title })).toBeInTheDocument();
    expect(screen.getByText(`By ${targetGuide.author}`)).toBeInTheDocument();
  });

  it("renders the 404 Guide Not Found fallback for nonexistent slug", () => {
    renderWithProviders(
      <Routes>
        <Route path="/guides/:slug" element={<GuideDetailPage />} />
      </Routes>,
      ["/guides/nonexistent-financial-guide-slug"],
    );

    expect(screen.getByRole("heading", { level: 1, name: "Guide not found" })).toBeInTheDocument();
    expect(
      screen.getByText(/The guide you requested could not be found/i),
    ).toBeInTheDocument();

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(breadcrumbs).getByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
    expect(within(breadcrumbs).getByText("Guide Not Found")).toHaveAttribute(
      "aria-current",
      "page",
    );

    const backLinks = screen.getAllByRole("link", { name: /Back to all guides|Browse all guides/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of backLinks) {
      expect(link).toHaveAttribute("href", "/guides");
    }

    const legalFooterNav = screen.getByRole("navigation", { name: "Legal and privacy" });
    expect(within(legalFooterNav).getByRole("link", { name: "Guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
  });
});
