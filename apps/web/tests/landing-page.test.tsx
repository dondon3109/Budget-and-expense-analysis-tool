// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { LandingPage } from "../src/pages/LandingPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

beforeEach(() => {
  // Default: the R2 metadata endpoint is unreachable, so the landing page
  // must render the safe download-unavailable state without network access.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup");
    expect(screen.getAllByRole("link", { name: "Start for free" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/signup"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/demo"]')).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose theme\. current theme: (light|dark|coffee)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learn more" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Zoption at a glance" })).toBeInTheDocument();
    expect(screen.getByText(/no payment required\. upgrade only/i)).toBeInTheDocument();
    expect(screen.getByText("Can I use Zoption for free?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Zoption Support" })).toBeInTheDocument();
  });

  it("highlights the six modules including subscriptions, savings, and the assistant", () => {
    renderLanding();

    const modules = screen.getByRole("region", {
      name: /everything that shapes your month/i,
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Zoption makes your money clear",
    );
    expect(
      within(modules).getByRole("heading", { name: "Import from the files you already use." }),
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
      name: "Illustrative preview of the Zoption monthly dashboard",
    });

    expect(preview).toBeInTheDocument();
    expect(preview.querySelector(".preview-metric-income")).toBeInTheDocument();
    expect(preview.querySelector(".preview-metric-expense")).toBeInTheDocument();
    expect(preview.querySelectorAll(".chart-bars span")).toHaveLength(6);
    expect(
      screen.getByText(/workspace begins without transactions or budgets/i),
    ).toBeInTheDocument();
  });

  it("promotes the official Android beta with its offline-first promise", () => {
    renderLanding();

    const installation = screen.getByRole("region", { name: "Take Zoption Beta to Android." });
    expect(within(installation).getAllByText(/same account and workspace/i).length).toBeGreaterThan(0);
    expect(within(installation).getByText(/offline-first entry/i)).toBeInTheDocument();
    expect(
      within(installation).getByText(/not distributed through Google Play/i),
    ).toBeInTheDocument();
    expect(
      within(installation).getByText(/uninstall it first/i),
    ).toBeInTheDocument();
    expect(
      within(installation).getByRole("link", { name: "Download Android APK" }),
    ).toHaveAttribute("href", "/install");
    expect(screen.getByRole("navigation", { name: "Learn more" })).toContainElement(
      screen.getByRole("link", { name: "Android APK" }),
    );
  });

  it("shows a safe unavailable state instead of GitHub-hosted release facts when metadata is unreachable", async () => {
    renderLanding();

    const installation = screen.getByRole("region", { name: "Take Zoption Beta to Android." });
    await waitFor(() =>
      expect(
        within(installation).getByText(/Android Beta download temporarily unavailable/i),
      ).toBeInTheDocument(),
    );
    expect(within(installation).queryByText(/bytes \(/)).not.toBeInTheDocument();
    expect(
      within(installation).getByRole("link", { name: "Download Android APK" }),
    ).toHaveAttribute("href", "/install");
  });

  it("shows customer-published reviews without manufacturing fallback testimonials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "review-1",
                  displayName: "Don",
                  rating: 5,
                  review: "Zoption keeps my monthly spending clear without connecting to my bank.",
                  featuredOrder: 1,
                  updatedAt: "2026-08-12T00:00:00.000Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    renderLanding();
    const section = screen.getByRole("region", { name: "Clearer money, in their own words." });
    await waitFor(() =>
      expect(within(section).getByText(/keeps my monthly spending clear/i)).toBeInTheDocument(),
    );
    expect(within(section).getByText("Don")).toBeInTheDocument();
    expect(within(section).getByLabelText("5 out of 5 stars")).toBeInTheDocument();
    expect(
      within(section).getByText(/explicitly consent to sharing; Zoption selects/i),
    ).toBeInTheDocument();
    expect(within(section).getByText(/does not rewrite their words with AI/i)).toBeInTheDocument();
  });
});
