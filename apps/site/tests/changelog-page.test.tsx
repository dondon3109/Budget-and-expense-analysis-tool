// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChangelogPage } from "../src/views/changelog/ChangelogPage";

function renderPage() {
  return render(<ChangelogPage />);
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
      "https://app.zoption.site/signup",
    );
    expect(screen.getByRole("link", { name: "Download Android Beta APK" })).toHaveAttribute(
      "href",
      "/install",
    );
  });
});
