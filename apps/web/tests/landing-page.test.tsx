// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { LandingPage } from "../src/pages/LandingPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

afterEach(cleanup);

function renderLanding() {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter>
          <LandingPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

describe("landing page", () => {
  it("offers account creation and sign in without linking to a public dashboard", () => {
    const { container } = renderLanding();

    expect(screen.getAllByRole("link", { name: /create account/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/signup"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/demo"]')).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose theme\. current theme: (light|dark|coffee)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learn more" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Zoption at a glance" })).toBeInTheDocument();
  });

  it("highlights the six modules including subscriptions, savings, and the assistant", () => {
    renderLanding();

    const modules = screen.getByRole("region", {
      name: /everything that shapes your month/i,
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "See where your money goes",
    );
    expect(
      within(modules).getByRole("heading", { name: "Import from the files you already keep." }),
    ).toBeInTheDocument();
    expect(
      within(modules).getByRole("heading", { name: "Set budgets that follow you." }),
    ).toBeInTheDocument();
    expect(
      within(modules).getByRole("heading", { name: "Name the bills that quietly repeat." }),
    ).toBeInTheDocument();
    expect(
      within(modules).getByRole("heading", { name: "Move money without surprises." }),
    ).toBeInTheDocument();
    expect(
      within(modules).getByRole("heading", { name: "Put your savings to work while you sleep." }),
    ).toBeInTheDocument();
    expect(
      within(modules).getByRole("heading", { name: "Ask your numbers, not a chatbot." }),
    ).toBeInTheDocument();
    expect(within(modules).getAllByText(/subscription/i).length).toBeGreaterThan(0);
  });

  it("presents supported export formats without duplicate announcements", () => {
    renderLanding();

    const formatsSection = screen.getByRole("region", {
      name: /bring a bank or spreadsheet export/i,
    });
    const institutions = within(formatsSection).getByRole("list", {
      name: "Supported institutions",
    });
    expect(
      within(institutions)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["BPI", "BDO", "MariBank", "Bank of America", "JPMorgan / Chase"]);
    expect(
      within(formatsSection).getByText(
        "Bank names are shown to indicate supported export formats only. Zoption is not affiliated with or endorsed by these institutions.",
      ),
    ).toBeInTheDocument();

    const visualTrack = formatsSection.querySelector(".formats-track");
    expect(visualTrack).toHaveAttribute("aria-hidden", "true");
    expect(visualTrack?.querySelectorAll('[data-marquee-copy="duplicate"]')).toHaveLength(1);
  });

  it("labels the dashboard artwork as illustrative and explains the empty start", () => {
    renderLanding();

    const preview = screen.getByRole("img", {
      name: "Illustrative preview of the Zoption monthly overview",
    });

    expect(preview).toBeInTheDocument();
    expect(preview.querySelector(".preview-metric-income")).toBeInTheDocument();
    expect(preview.querySelector(".preview-metric-expense")).toBeInTheDocument();
    expect(preview.querySelectorAll(".chart-bars span")).toHaveLength(6);
    expect(
      screen.getByText(/workspace begins without transactions or budgets/i),
    ).toBeInTheDocument();
  });
});
