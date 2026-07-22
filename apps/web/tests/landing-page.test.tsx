// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LandingPage } from "../src/pages/LandingPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

afterEach(cleanup);

function renderLanding() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
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
      screen.getByRole("button", { name: /switch to (dark|light) mode/i }),
    ).toBeInTheDocument();
  });

  it("highlights file imports without the extra hero label", () => {
    renderLanding();

    expect(screen.queryByText("A calmer way to understand your money")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "See where your money goes. Decide what comes next.",
      }),
    ).toBeInTheDocument();

    const importSection = screen.getByRole("region", {
      name: "Import from the files you already use.",
    });
    expect(
      within(importSection).getByRole("heading", { name: "Start with Excel" }),
    ).toBeInTheDocument();
    expect(
      within(importSection).getByText(
        /Already tracking finances in Excel\? Import your workbook, choose a worksheet/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(importSection).getByRole("heading", { name: "Bring your bank export" }),
    ).toBeInTheDocument();
    expect(
      within(importSection).getByText(
        /Export your bank transactions, import the file, and see your spending habits/i,
      ),
    ).toBeInTheDocument();
  });

  it("presents supported export formats without duplicate announcements", () => {
    renderLanding();

    const formatsSection = screen.getByRole("region", { name: "Supported Export Formats" });
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
        "Bank names are shown to indicate supported export formats only. Clarity is not affiliated with or endorsed by these institutions.",
      ),
    ).toBeInTheDocument();

    const visualTrack = formatsSection.querySelector(".supported-formats-track");
    expect(visualTrack).toHaveAttribute("aria-hidden", "true");
    expect(visualTrack?.querySelectorAll('[data-marquee-copy="duplicate"]')).toHaveLength(1);

    expect(
      within(formatsSection).queryByRole("button", {
        name: /supported export formats animation/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("labels the dashboard artwork as illustrative and explains the empty start", () => {
    renderLanding();

    expect(
      screen.getByRole("img", { name: "Illustrative preview of the Clarity monthly dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/workspace begins without transactions or budgets/i),
    ).toBeInTheDocument();
  });
});
