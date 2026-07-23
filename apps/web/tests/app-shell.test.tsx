// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/components/layout/AppShell";
import { ThemeProvider } from "../src/theme/ThemeProvider";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com", user_metadata: { display_name: "Taylor" } },
    signOut: vi.fn(),
  }),
}));

describe("AppShell", () => {
  afterEach(cleanup);

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
    expect(screen.getByText("Taylor")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
    expect(screen.getAllByRole("button", { name: /switch to (dark|light) mode/i })).toHaveLength(2);
  });

  it("marks account settings as current without adding it to main navigation", () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/settings"]}>
          <AppShell>
            <div>Settings content</div>
          </AppShell>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByRole("link", { name: "Account settings" })).toHaveClass("current");
    expect(
      Array.from(
        screen.getByRole("navigation", { name: "Main navigation" }).querySelectorAll("a"),
      ).map((link) => link.textContent?.trim()),
    ).toEqual(["Overview", "Calendar", "Transactions", "Import", "Budgets", "Subscriptions"]);
  });
});
