// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseOptionalAuth = vi.fn();

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
  useOptionalAuth: () => mockUseOptionalAuth(),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("../src/components/legal/LegalFooter", () => ({
  LegalFooter: () => <footer data-testid="legal-footer" />,
}));

import { AppTutorialsPage } from "../src/pages/tutorials/AppTutorialsPage";
import { TutorialsPage } from "../src/pages/tutorials/TutorialsPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

describe("TutorialsPage", () => {
  beforeEach(() => {
    mockUseOptionalAuth.mockReturnValue({ user: { id: "user-1", email: "user@example.com" } });
  });

  afterEach(cleanup);

  function renderPage() {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/tutorials"]}>
          <TutorialsPage />
        </MemoryRouter>
      </ThemeProvider>,
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

    const budgetingPill = screen.getByRole("radio", { name: "Budgeting" });
    fireEvent.click(budgetingPill);

    expect(
      screen.getByRole("heading", { name: "How to Use Envelope Budgeting" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Tracking Monthly Bills & Subscriptions" }),
    ).not.toBeInTheDocument();
  });

  it("uses the up-to-date shared tutorials copy and supports declarative WebMCP", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Importing Bank Statements (PDF, CSV & Excel)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Offline Use & Data Protection" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Zero-Knowledge Encryption/i)).not.toBeInTheDocument();

    const form = document.querySelector<HTMLFormElement>('form[toolname="filter-tutorials"]')!;
    expect(form).toHaveAttribute("toolautosubmit", "");
    const input = form.querySelector<HTMLInputElement>('input[name="query"]')!;
    fireEvent.change(input, { target: { value: "MariBank" } });

    let responsePromise: Promise<unknown> | undefined;
    form.dispatchEvent(
      Object.assign(new Event("submit", { bubbles: true, cancelable: true }), {
        agentInvoked: true,
        respondWith: (promise: Promise<unknown>) => {
          responsePromise = promise;
        },
      }),
    );

    await expect(responsePromise).resolves.toMatchObject({
      query: "MariBank",
      category: "All",
      matchCount: 1,
      matches: [expect.objectContaining({ id: "bank-csv-imports" })],
    });
  });

  it("renders inside AppShell for AppTutorialsPage", () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/tutorials"]}>
          <AppTutorialsPage />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to Use Zoption" })).toBeInTheDocument();
  });
});
