// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { setupDrawer, setupThemeMenu } from "../src/client/site";
import { PublicHeader, type PublicHeaderLink } from "../src/components/navigation/PublicHeader";

function renderHeader(links?: PublicHeaderLink[]) {
  const result = render(links ? <PublicHeader links={links} /> : <PublicHeader />);
  setupDrawer();
  setupThemeMenu();
  return result;
}

afterEach(cleanup);

describe("PublicHeader", () => {
  it("publishes one consistent navigation with a single line per label", () => {
    renderHeader();

    const navigation = screen.getByRole("navigation", { name: "Learn more" });
    const labels = within(navigation)
      .getAllByRole("link")
      .map((link) => link.textContent);

    expect(labels).toEqual(["Pricing", "Guides", "Tutorials", "FAQ", "Android Beta"]);
    for (const link of within(navigation).getAllByRole("link")) {
      expect(link).toHaveAttribute("href");
    }
  });

  it("opens Start free and Sign in on the app origin in a new tab, header and drawer alike", () => {
    renderHeader();

    const appLinks = [
      ["Start free", "https://app.zoption.site/signup"],
      ["Sign in", "https://app.zoption.site/login"],
    ] as const;
    for (const [name, href] of appLinks) {
      // The drawer starts hidden, so include hidden links to cover both copies.
      const links = screen.getAllByRole("link", { name, hidden: true });
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener");
      }
    }
  });

  it("opens and closes the mobile menu, restoring focus to the trigger", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({
      user: module.default.setup(),
    }));

    renderHeader();

    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();

    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(drawer).getByRole("link", { name: "Tutorials" })).toHaveAttribute(
      "href",
      "/tutorials",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveFocus();
  });

  it("accepts page-specific section links without changing its own chrome", () => {
    render(
      <PublicHeader
        links={[
          { label: "Features", href: "#modules" },
          { label: "Pricing", href: "/pricing" },
        ]}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "Learn more" });
    expect(within(navigation).getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "#modules",
    );
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
    // All-primary links never earn the modifier that reveals the trigger early.
    expect(document.querySelector("header.public-header")).not.toHaveClass("has-secondary-links");
  });

  it("marks a secondary link, announces it, and keeps it in the drawer", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({
      user: module.default.setup(),
    }));

    renderHeader([
      { label: "Features", href: "#modules" },
      { label: "Reviews", href: "#reviews", secondary: true },
    ]);

    expect(document.querySelector("header.public-header")).toHaveClass("has-secondary-links");

    const navigation = screen.getByRole("navigation", { name: "Learn more" });
    expect(within(navigation).getByRole("link", { name: "Reviews" })).toHaveClass("is-secondary");
    expect(within(navigation).getByRole("link", { name: "Features" })).not.toHaveClass(
      "is-secondary",
    );

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(within(drawer).getByRole("link", { name: "Reviews" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Features" })).toBeInTheDocument();
  });

  it("switches and remembers the theme from the header menu", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({
      user: module.default.setup(),
    }));
    document.documentElement.dataset.theme = "light";
    renderHeader();

    await user.click(screen.getByRole("button", { name: /^Choose theme/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("zoption-theme")).toBe("dark");
    expect(screen.queryByRole("menu", { name: "Choose theme" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Choose theme/ })).toHaveFocus();
  });

  it("offers a skip link as the first focusable control, targeting the content landmark", () => {
    renderHeader();

    const banner = screen.getByRole("banner");
    const firstLink = within(banner).getAllByRole("link")[0];
    expect(firstLink).toHaveTextContent("Skip to content");
    expect(firstLink).toHaveAttribute("href", "#main-content");
  });
});
