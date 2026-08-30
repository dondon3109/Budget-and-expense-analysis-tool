// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { ThankYouPage } from "../src/pages/ThankYouPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderThankYouPage(entry = "/thank-you") {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={[entry]}>
          <ThankYouPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("ThankYouPage", () => {
  it("renders default thank you content when no flow param is provided", () => {
    renderThankYouPage();

    expect(
      screen.getByRole("heading", { level: 1, name: /Thank you for choosing Zoption/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to workspace/i })).toHaveAttribute("href", "/app");
  });

  it("renders Pro subscription thank you content for flow=pro", () => {
    renderThankYouPage("/thank-you?flow=pro");

    expect(
      screen.getByRole("heading", { level: 1, name: /Thank you for upgrading to Zoption Pro!/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to your workspace/i })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: /Manage Plan & Billing/i })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
    expect(screen.getByText(/Priority support response turnaround/i)).toBeInTheDocument();
  });

  it("renders signup thank you content for flow=signup", () => {
    renderThankYouPage("/thank-you?flow=signup");

    expect(
      screen.getByRole("heading", { level: 1, name: /Thank you for creating your account/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open your workspace/i })).toHaveAttribute(
      "href",
      "/app",
    );
  });

  it("renders bug report thank you content for flow=report", () => {
    renderThankYouPage("/thank-you?flow=report");

    expect(
      screen.getByRole("heading", { level: 1, name: /Thank you for your bug report/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/reviews all submitted reports within 24 to 48 hours/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track your reports/i })).toHaveAttribute(
      "href",
      "/app/support/reports",
    );
  });
});
