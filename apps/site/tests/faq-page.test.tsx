// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FaqPage } from "../src/views/faq/FaqPage";
import { FAQ_ITEMS_PUBLIC } from "../src/seo/siteMetadata";

function renderPage() {
  return render(<FaqPage />);
}

afterEach(cleanup);

describe("FAQ page", () => {
  it("publishes a single-h1 FAQ surface with grouped questions", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Frequently asked questions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Does Zoption connect to my bank?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "How does the AI Financial Assistant work, and what does it read?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Can I track subscriptions and recurring charges?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How does automatic savings interest work?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How does Zoption billing work?" }),
    ).toBeInTheDocument();

    // Categories replace the flat 34-line list.
    const categories = screen.getByRole("navigation", { name: "FAQ categories" });
    expect(within(categories).getByRole("link", { name: "Plans & billing" })).toHaveAttribute(
      "href",
      "#category-plans-billing",
    );
    expect(screen.getByRole("heading", { name: "Privacy & data" })).toBeInTheDocument();
  });

  it("renders each answer as a native disclosure, so every answer is in the HTML", () => {
    renderPage();

    const answer = screen.getByText(/CSV, XLSX, and XLS\. Pick a workbook, choose a worksheet/i);
    const item = answer.closest("details");
    expect(item).toHaveAttribute("id", "what-file-formats-can-i-import");
    expect(item).not.toHaveAttribute("open");
    expect(item?.querySelector("summary")).toHaveTextContent("What file formats can I import?");
  });

  it("keeps every question anchored next to its own answer", () => {
    renderPage();

    const items = document.querySelectorAll(".faq-page-item");
    expect(items.length).toBe(FAQ_ITEMS_PUBLIC.length);
    for (const item of items) {
      expect(item.id).not.toBe("");
      expect(item.querySelector(".faq-page-question-toggle")).not.toBeNull();
      expect(item.querySelector(".faq-page-answer p")).not.toBeNull();
    }
  });

  it("explains the empty-start and no-bank-connection approach and links to signup", () => {
    renderPage();

    expect(
      screen.getByText(/starts empty and private, with no bank connection/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your workspace" })).toHaveAttribute(
      "href",
      "https://app.zoption.site/signup",
    );
  });
});
