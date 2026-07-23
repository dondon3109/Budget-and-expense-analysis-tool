// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/components/layout/AppShell";
import { ThemeProvider } from "../src/theme/ThemeProvider";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

describe("AppShell", () => {
  it("places Subscriptions directly below Budgets and above the account footer", () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/subscriptions"]}>
          <AppShell>
            <div>Subscriptions content</div>
          </AppShell>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(
      Array.from(navigation.querySelectorAll("a")).map((link) => link.textContent?.trim()),
    ).toEqual(["Overview", "Calendar", "Transactions", "Import", "Budgets", "Subscriptions"]);
    expect(screen.getByRole("link", { name: "Subscriptions" })).toHaveClass("current");
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
      "aria-controls",
      "primary-navigation",
    );
    expect(screen.queryByText("Personal workspace")).not.toBeInTheDocument();
    expect(screen.getByText("Signed in as")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /switch to (dark|light) mode/i })).toHaveLength(2);
  });
});
