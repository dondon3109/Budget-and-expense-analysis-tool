// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { CookiePolicyPage } from "../src/pages/legal/CookiePolicyPage";
import { PrivacyPolicyPage } from "../src/pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "../src/pages/legal/TermsOfServicePage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderPage(page: React.ReactNode) {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter>{page}</MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("legal pages", () => {
  it("publishes product-specific Terms with unresolved business facts marked", () => {
    renderPage(<TermsOfServicePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText("Last updated: August 2, 2026")).toBeInTheDocument();
    expect(
      screen.getByText(/does not currently connect directly to your bank/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/filtered transaction CSV feature/i)).toBeInTheDocument();
    expect(screen.getByText(/separate, versioned consent/i)).toBeInTheDocument();
    expect(screen.getByText(/calculated from the transactions recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/sanitized audit snapshots/i)).toBeInTheDocument();
    expect(screen.getByText(/through PayPal/i)).toBeInTheDocument();
    expect(screen.getByText(/renew automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/verified PayPal webhook notification/i)).toBeInTheDocument();
    expect(
      screen.getByText(/account deletion control in your account settings/i),
    ).toBeInTheDocument();
  });

  it("describes actual processors, financial security, and user rights", () => {
    renderPage(<PrivacyPolicyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/Zoption does not sell user financial data/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Supabase/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cloudflare/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DeepSeek/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PayPal/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/public storage link/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Full payment-card credentials/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/minimal verified-webhook event metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/transaction-derived balances/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sanitized audit/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a complete account-data archive/i)).toBeInTheDocument();
    expect(screen.getByText(/includes an in-app account-deletion control/i)).toBeInTheDocument();
  });

  it("states optional categories are inactive and exposes Cookie Settings", () => {
    renderPage(<CookiePolicyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Cookie Policy" })).toBeInTheDocument();
    expect(
      screen.getByText(/Google Analytics 4 for optional usage and performance measurement/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No marketing provider is currently enabled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Cookie Settings" })).toBeInTheDocument();
    expect(screen.getByText(/assistant has a separate consent flow/i)).toBeInTheDocument();
  });

  it("uses one shared legal footer on legal surfaces", () => {
    renderPage(<PrivacyPolicyPage />);

    const footerNavigation = screen.getByRole("navigation", { name: "Legal and privacy" });
    expect(footerNavigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms-of-service",
    );
    expect(screen.getByRole("button", { name: "Cookie Settings" })).toBeInTheDocument();
  });
});
