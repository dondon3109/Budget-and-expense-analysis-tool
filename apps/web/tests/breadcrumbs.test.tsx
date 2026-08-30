// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { Breadcrumbs } from "../src/components/navigation/Breadcrumbs";

afterEach(cleanup);

describe("Breadcrumbs", () => {
  it("renders nothing when items are empty", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a list of breadcrumb items with accessible navigation markup", () => {
    render(
      <MemoryRouter>
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Settings", to: "/app/settings" },
            { label: "Plan & Billing" },
          ]}
        />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: /Breadcrumb/i });
    expect(nav).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("href", "/");

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink).toHaveAttribute("href", "/app/settings");

    const currentItem = screen.getByText("Plan & Billing");
    expect(currentItem).toHaveAttribute("aria-current", "page");
    expect(currentItem.tagName).toBe("SPAN");
  });
});
