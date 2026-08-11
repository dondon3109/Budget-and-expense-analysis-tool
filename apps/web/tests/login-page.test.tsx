// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  configured: true,
  signIn: vi.fn(),
  signInWithSocial: vi.fn(),
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
    authState.signInWithSocial.mockReset().mockResolvedValue(undefined);
  });

  it("offers Google and Facebook without creating a separate workspace", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Facebook" })).toBeInTheDocument();
    expect(
      screen.getByText(/same verified email keeps your existing Zoption workspace/i),
    ).toBeInTheDocument();
  });

  it("starts social sign-in with the requested safe destination and prevents duplicate clicks", async () => {
    renderLogin("/login?redirectTo=%2Fapp%2Fsettings%3Fsection%3Dbilling");

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(authState.signInWithSocial).toHaveBeenCalledWith(
        "google",
        "/app/settings?section=billing",
      ),
    );
    expect(screen.getByRole("button", { name: "Connecting to Google…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue with Facebook" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("falls back to the app destination for an unsafe social redirect", async () => {
    renderLogin("/login?redirectTo=%2F%2Fevil.test");

    fireEvent.click(screen.getByRole("button", { name: "Continue with Facebook" }));

    await waitFor(() =>
      expect(authState.signInWithSocial).toHaveBeenCalledWith("facebook", "/app?proCheckout=open"),
    );
  });

  it("shows a recoverable social sign-in error without provider details", async () => {
    authState.signInWithSocial.mockRejectedValueOnce(new Error("provider configuration detail"));
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Facebook" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Facebook sign-in could not be started. Check your connection and try again.",
    );
    expect(screen.queryByText(/provider configuration detail/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Facebook" })).toBeEnabled();
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

  it("keeps the sign-in form available but disabled while sign-in is pending", async () => {
    let resolveSignIn: (() => void) | undefined;
    authState.signIn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    renderLogin();
    fillCredentials();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const form = screen.getByLabelText("Email address").closest("form");
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Email address")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.queryByText("Preparing your workspace")).not.toBeInTheDocument();

    await act(async () => resolveSignIn?.());
    await waitFor(() =>
      expect(screen.getByTestId("current-path")).toHaveTextContent("/app?proCheckout=open"),
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
