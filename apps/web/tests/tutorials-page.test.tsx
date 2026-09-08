// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("../src/components/legal/LegalFooter", () => ({
  LegalFooter: () => <footer data-testid="legal-footer" />,
}));

import { TutorialsPage } from "../src/pages/tutorials/TutorialsPage";

describe("TutorialsPage", () => {
  afterEach(cleanup);

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/app/tutorials"]}>
        <TutorialsPage />
      </MemoryRouter>,
    );
  }

  it("renders tutorials hero and key sections", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "How to Use Zoption" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search tutorials/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How to Adjust Current Account Balances" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How to Use Envelope Budgeting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Go to Dashboard to adjust balance/i }),
    ).toBeInTheDocument();
  });

  it("filters tutorials based on search query", () => {
    renderPage();

    const searchInput = screen.getByPlaceholderText(/search tutorials/i);
    fireEvent.change(searchInput, { target: { value: "envelope" } });

    expect(
      screen.getByRole("heading", { name: "How to Use Envelope Budgeting" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "How to Adjust Current Account Balances" }),
    ).not.toBeInTheDocument();
  });

  it("filters tutorials by category pill", () => {
    renderPage();

    const budgetingPill = screen.getByRole("button", { name: "Budgeting" });
    fireEvent.click(budgetingPill);

    expect(
      screen.getByRole("heading", { name: "How to Use Envelope Budgeting" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Tracking Subscriptions & Recurring Bills" }),
    ).not.toBeInTheDocument();
  });
});
