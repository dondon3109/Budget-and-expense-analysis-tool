// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { PricingPage } from "../src/pages/pricing/PricingPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderPricingPage() {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
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

  it("toggles pricing between monthly and annual billing intervals", async () => {
    const user = userEvent.setup();
    renderPricingPage();

    // Default is monthly (₱149)
    expect(screen.getByText("₱149")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Monthly billing/i })).toHaveClass("active");

    // Switch to annual (₱1,299)
    const annualButton = screen.getByRole("radio", { name: /Annual billing/i });
    await user.click(annualButton);

    expect(screen.getByText("₱1,299")).toBeInTheDocument();
    expect(annualButton).toHaveClass("active");
  });

  it("provides direct navigation and call-to-action links", () => {
    renderPricingPage();

    const signupLinks = screen.getAllByRole("link", {
      name: /Start free|Create free workspace|Start with Pro|Create your free workspace/i,
    });
    expect(signupLinks.length).toBeGreaterThan(0);
    expect(signupLinks[0]).toHaveAttribute("href", "/signup");

    const apkLinks = screen.getAllByRole("link", {
      name: /Download Android APK|Android APK/i,
    });
    expect(apkLinks.length).toBeGreaterThan(0);
    expect(apkLinks[0]).toHaveAttribute("href", "/install");
  });
});
