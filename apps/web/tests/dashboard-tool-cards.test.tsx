// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { DashboardToolCards } from "../src/components/dashboard/DashboardToolCards";

afterEach(cleanup);

describe("DashboardToolCards", () => {
  it("links to the remittance calculator with the mid-market USD benchmark", () => {
    render(
      <MemoryRouter>
        <DashboardToolCards />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /remittance calculator/i });
    expect(link).toHaveAttribute("href", "/app/plan#remittance-calculator");
    expect(within(link).getByText("1 USD = ₱56.50")).toBeInTheDocument();
    // Safe to spend has its own hero card; the tool row must not repeat it.
    expect(screen.queryByRole("heading", { name: "Safe to spend" })).not.toBeInTheDocument();
  });
});
