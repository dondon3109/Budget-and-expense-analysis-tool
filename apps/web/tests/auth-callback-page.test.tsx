// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/components/auth/AuthLayout", () => ({
  AuthLayout: ({
    title,
    description,
    children,
    footer,
  }: {
    title: string;
    description: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
      {footer}
    </main>
  ),
}));

import { AuthCallbackPage } from "../src/pages/AuthCallbackPage";

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderCallback(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthCallbackPage />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

describe("AuthCallbackPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.exchangeCodeForSession.mockReset().mockResolvedValue(false);
    sessionStorage.clear();
  });

  it("routes recovery codes to the password form even without a next parameter", async () => {
    authState.exchangeCodeForSession.mockResolvedValue(true);
    renderCallback("/auth/callback?code=recovery-code");

    await waitFor(() =>
      expect(authState.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent("/update-password"),
    );
  });

  it("uses a safe requested destination for non-recovery account links", async () => {
    renderCallback("/auth/callback?code=confirmation-code&next=%2Fapp%2Fsettings");

    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent("/app/settings"),
    );
  });

  it("restores a social sign-in destination without changing the allow-listed callback URL", async () => {
    sessionStorage.setItem("zoption-social-auth-destination", "/app/settings?section=billing");
    renderCallback("/auth/callback?code=social-code");

    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        "/app/settings?section=billing",
      ),
    );
    expect(sessionStorage.getItem("zoption-social-auth-destination")).toBeNull();
  });

  it.each(["https%3A%2F%2Fevil.example", "%2F%2Fevil.example"])(
    "falls back to the app for unsafe next destination %s",
    async (next) => {
      renderCallback(`/auth/callback?code=confirmation-code&next=${next}`);

      await waitFor(() => expect(screen.getByTestId("current-location")).toHaveTextContent("/app"));
    },
  );

  it("offers a new reset link when the recovery callback has no code", async () => {
    renderCallback("/auth/callback?next=%2Fupdate-password");

    expect(
      await screen.findByRole("heading", { name: "Request a new reset link" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/invalid, expired, or has already been used/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send a new reset link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("hides provider details when code exchange fails", async () => {
    authState.exchangeCodeForSession.mockRejectedValue(new Error("provider detail"));
    renderCallback("/auth/callback?code=expired&next=%2Fupdate-password");

    expect(
      await screen.findByRole("heading", { name: "Request a new reset link" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("provider detail")).not.toBeInTheDocument();
  });

  it("handles provider-declared callback errors", async () => {
    renderCallback(
      "/auth/callback?error=access_denied&error_description=Link%20expired&next=%2Fupdate-password",
    );

    expect(
      await screen.findByRole("heading", { name: "Request a new reset link" }),
    ).toBeInTheDocument();
    expect(authState.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("offers a retry without exposing social-provider callback details", async () => {
    renderCallback(
      "/auth/callback?error=access_denied&error_description=Private%20provider%20detail",
    );

    expect(
      await screen.findByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText(/Private provider detail/i)).not.toBeInTheDocument();
  });
});
