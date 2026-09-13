// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { NotFoundPage } from "../src/pages/NotFoundPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderPage() {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={["/does-not-exist"]}>
          <NotFoundPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("NotFoundPage", () => {
  it("renders the shared public shell instead of a chromeless page", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "That page is not here." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Zoption home" })).toHaveAttribute("href", "/");

    // Shared header navigation and the shared legal footer both render.
    const headerNavigation = screen.getByRole("navigation", { name: "Learn more" });
    expect(within(headerNavigation).getByRole("link", { name: "FAQ" })).toHaveAttribute(
      "href",
      "/faq",
    );
    expect(screen.getByRole("navigation", { name: "Legal and privacy" })).toBeInTheDocument();
  });

  it("offers more than one way forward and a mobile menu trigger", () => {
    renderPage();

    const destinations = screen.getByRole("navigation", { name: "Popular pages" });
    expect(within(destinations).getAllByRole("link").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
  });
});
