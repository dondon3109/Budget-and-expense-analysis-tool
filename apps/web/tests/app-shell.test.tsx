// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/components/layout/AppShell";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

describe("AppShell", () => {
  it("places Subscriptions directly below Budgets and above the account footer", () => {
    render(
      <MemoryRouter initialEntries={["/app/subscriptions"]}>
        <AppShell>
          <div>Subscriptions content</div>
        </AppShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(
      Array.from(navigation.querySelectorAll("a")).map((link) => link.textContent?.trim()),
    ).toEqual(["Overview", "Transactions", "Import", "Budgets", "Subscriptions"]);
    expect(screen.getByRole("link", { name: "Subscriptions" })).toHaveClass("current");
    expect(screen.getByText("Signed in as")).toBeInTheDocument();
  });
});
