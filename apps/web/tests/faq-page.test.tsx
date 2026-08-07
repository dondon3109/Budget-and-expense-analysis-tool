// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { FaqPage } from "../src/pages/faq/FaqPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderPage() {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter>
          <FaqPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("FAQ page", () => {
  it("publishes a single-h1 FAQ surface with expanded questions", () => {
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
