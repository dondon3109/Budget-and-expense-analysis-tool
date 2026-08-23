// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
// Assert against the committed fallback snapshot so refreshing it never
// breaks this test.
import { ANDROID_RELEASE } from "../src/releases/androidRelease";
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
    expect(within(installation).getAllByText(/same account and workspace/i).length).toBeGreaterThan(
      0,
    );
    expect(within(installation).getByText(/offline-first entry/i)).toBeInTheDocument();
    expect(
      within(installation).getByText(/not distributed through Google Play/i),
    ).toBeInTheDocument();
    expect(within(installation).getByText(/uninstall it first/i)).toBeInTheDocument();
    expect(
      within(installation).getByRole("link", { name: "Download Android APK" }),
    ).toHaveAttribute("href", "/install");
    expect(screen.getByRole("navigation", { name: "Learn more" })).toContainElement(
      screen.getByRole("link", { name: "Android APK" }),
    );
  });

  it("keeps the official R2 snapshot visible when live metadata is unreachable", async () => {
    renderLanding();

    const installation = screen.getByRole("region", { name: "Take Zoption Beta to Android." });
    const label = ANDROID_RELEASE.sizeLabel;
    expect(
      within(installation).getByText((_, element) => {
        if (!element || !element.textContent?.includes(label)) return false;
        return ![...element.children].some((child) => child.textContent?.includes(label));
      }),
    ).toBeInTheDocument();
    expect(within(installation).queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
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

  it("toggles the responsive mobile navigation drawer and dismisses on selection or Escape", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({
      user: module.default.setup(),
    }));

    renderLanding();

    const toggleButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(toggleButton).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();

    await user.click(toggleButton);
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(drawer).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toBeInTheDocument();

    const mobileFeaturesLink = within(drawer).getByRole("link", { name: "Features" });
    expect(mobileFeaturesLink).toHaveAttribute("href", "#modules");

    // Dismiss on link click
    await user.click(mobileFeaturesLink);
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();

    // Reopen and dismiss on Escape
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
  });

  it("highlights voice entry, receipt scanning, PDF/Excel/CSV imports, and the AI assistant in the interactive spotlight", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({
      user: module.default.setup(),
    }));

    renderLanding();

    const spotlight = screen.getByRole("region", {
      name: /never type a transaction again/i,
    });
    expect(spotlight).toBeInTheDocument();

    // Verify Voice Entry is active by default (Top Priority)
    expect(within(spotlight).getByRole("tab", { name: /voice entry/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(spotlight).getByText(/just talk to log your spending/i)).toBeInTheDocument();
    expect(within(spotlight).getByText(/live voice simulator/i)).toBeInTheDocument();

    // Switch to Scan Receipt (Top Priority)
    const receiptTab = within(spotlight).getByRole("tab", { name: /scan receipt/i });
    await user.click(receiptTab);
    expect(receiptTab).toHaveAttribute("aria-selected", "true");
    expect(within(spotlight).getByText(/take a picture of any receipt/i)).toBeInTheDocument();
    expect(within(spotlight).getByText(/smart ocr scanner/i)).toBeInTheDocument();

    // Switch to PDF, CSV & Excel
    const filesTab = within(spotlight).getByRole("tab", { name: /pdf, csv & excel/i });
    await user.click(filesTab);
    expect(filesTab).toHaveAttribute("aria-selected", "true");
    expect(within(spotlight).getByText(/import pdf, csv, and excel files/i)).toBeInTheDocument();
    expect(within(spotlight).getByText(/multi-format dropzone/i)).toBeInTheDocument();

    // Switch to AI Assistant
    const aiTab = within(spotlight).getByRole("tab", { name: /ai assistant/i });
    await user.click(aiTab);
    expect(aiTab).toHaveAttribute("aria-selected", "true");
    expect(within(spotlight).getByText(/ask your numbers, not a generic chatbot/i)).toBeInTheDocument();
    expect(within(spotlight).getByText(/grounded ai assistant/i)).toBeInTheDocument();
  });
});


