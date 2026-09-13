// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { FaqPage } from "../src/pages/faq/FaqPage";
import { FAQ_ITEMS_PUBLIC } from "../src/seo/siteMetadata";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderPage(entry = "/faq") {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={[entry]}>
          <FaqPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("FAQ page", () => {
  it("publishes a single-h1 FAQ surface with grouped questions", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Frequently asked questions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Does Zoption connect to my bank?" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How does the AI Financial Assistant work, and what does it read?" }),
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

  it("expands and collapses one answer at a time", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({
      user: module.default.setup(),
    }));

    renderPage();

    const toggle = screen.getByRole("button", { name: "What file formats can I import?" });
    const answerId = toggle.getAttribute("aria-controls");
    expect(answerId).toBe("what-file-formats-can-i-import-answer");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(answerId!)).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/CSV, XLSX, and XLS\. Pick a workbook, choose a worksheet/i),
    ).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(answerId!)).not.toBeVisible();
  });

  it("opens the question named by the URL hash so answers are deep-linkable", () => {
    renderPage("/faq#does-zoption-connect-to-my-bank");

    const toggle = screen.getByRole("button", { name: "Does Zoption connect to my bank?" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Zoption does not connect to banks/i)).toBeVisible();
    expect(document.getElementById("does-zoption-connect-to-my-bank")).toBeInTheDocument();
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

    expect(screen.getByText(/starts empty and private, with no bank connection/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your workspace" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
