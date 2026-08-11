// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  configured: true,
  signUp: vi.fn(),
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

import { SignupPage } from "../src/pages/SignupPage";

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{`${location.pathname}${location.search}`}</output>;
}

function renderSignup(initialEntry = "/signup") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SignupPage />
      <CurrentPath />
    </MemoryRouter>,
  );
}

function fillValidCredentials() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "  user@example.com  " },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "Budgeting-2026!" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "Budgeting-2026!" },
  });
}

describe("SignupPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.configured = true;
    authState.signUp.mockReset().mockResolvedValue({ confirmationRequired: false });
    authState.signInWithSocial.mockReset().mockResolvedValue(undefined);
  });

  it("offers provider signup through the same deduplicating social sign-in flow", async () => {
    renderSignup();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Facebook" }));

    await waitFor(() =>
      expect(authState.signInWithSocial).toHaveBeenCalledWith("facebook", "/app?proCheckout=open"),
    );
    expect(screen.getByRole("button", { name: "Connecting to Facebook…" })).toBeDisabled();
    expect(authState.signUp).not.toHaveBeenCalled();
  });

  it("renders accessible password guidance and updates it while typing", () => {
    renderSignup();

    const password = screen.getByLabelText("Password");
    const meter = screen.getByRole("progressbar");
    expect(password).toHaveAttribute("aria-describedby", "signup-password-guidance");
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument();

    fireEvent.change(password, { target: { value: "Budgeting-2026!" } });

    expect(meter).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByText("Strong")).toBeInTheDocument();
  });

  it("reveals password fields independently", () => {
    renderSignup();

    const password = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Show confirm password" })).toBeInTheDocument();
  });

  it("blocks weak passwords before calling Supabase", () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(authState.signUp).not.toHaveBeenCalled();
    expect(screen.getByText("Use a password that meets every requirement.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("blocks a confirmation mismatch before calling Supabase", () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Budgeting-2026?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(authState.signUp).not.toHaveBeenCalled();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("aria-invalid", "true");
  });

  it("trims the email and submits a valid form once", async () => {
    renderSignup();
    fillValidCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(authState.signUp).toHaveBeenCalledWith("user@example.com", "Budgeting-2026!"),
    );
  });

  it("shows a neutral confirmation state with a home link", async () => {
    authState.signUp.mockResolvedValueOnce({ confirmationRequired: true });
    renderSignup();
    fillValidCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  });

  it("navigates to the app when Supabase returns a session", async () => {
    renderSignup();
    fillValidCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByTestId("current-path")).toHaveTextContent("/app?proCheckout=open"),
    );
  });

  it("disables the form while signup is pending", async () => {
    let resolveSignup!: (value: { confirmationRequired: boolean }) => void;
    authState.signUp.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignup = resolve;
      }),
    );
    renderSignup();
    fillValidCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("button", { name: "Creating account…" })).toBeDisabled();
    expect(screen.getByLabelText("Email address")).toBeDisabled();
    resolveSignup({ confirmationRequired: false });
  });
});
