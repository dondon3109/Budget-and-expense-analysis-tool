// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { ChangelogPage } from "../src/pages/changelog/ChangelogPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderPage() {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter>
          <ChangelogPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("Changelog page", () => {
  it("publishes a single-h1 changelog surface with release notes and cta links", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Changelog & Product Updates" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Category emojis across web and mobile/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Preferred Source" })).toHaveAttribute(
      "href",
      "https://www.google.com/preferences/source?q=zoption.site",
    );
    expect(screen.getByRole("link", { name: /Create your workspace/i })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByRole("link", { name: "Download Android Beta APK" })).toHaveAttribute(
      "href",
      "/install",
    );
  });
});
