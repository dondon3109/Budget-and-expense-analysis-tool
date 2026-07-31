// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  configured: true,
  signIn: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/components/auth/AuthLayout", () => ({
  AuthLayout: ({
    title,
    children,
    footer,
  }: {
    title: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
      {footer}
    </main>
  ),
}));

import { LoginPage } from "../src/pages/LoginPage";

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{`${location.pathname}${location.search}`}</output>;
}

function renderLogin(initialEntry = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LoginPage />
      <CurrentPath />
    </MemoryRouter>,
  );
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Budgeting-2026!" } });
}

describe("LoginPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.configured = true;
    authState.signIn.mockReset().mockResolvedValue(undefined);
  });

  it("lets someone reveal their password before signing in", async () => {
    renderLogin();

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(password, { target: { value: "Budgeting-2026!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(authState.signIn).toHaveBeenCalledWith("user@example.com", "Budgeting-2026!"),
    );
  });

  it("opens the checkout chooser after a direct sign-in", async () => {
    renderLogin();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByTestId("current-path")).toHaveTextContent("/app?proCheckout=open"),
    );
  });

  it("preserves an explicit return destination after sign-in", async () => {
    renderLogin("/login?redirectTo=%2Fapp%2Fsettings%3Fsection%3Dbilling");
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByTestId("current-path")).toHaveTextContent("/app/settings?section=billing"),
    );
  });
});
