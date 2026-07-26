// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  configured: true,
  sendPasswordReset: vi.fn(),
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

import { ForgotPasswordPage } from "../src/pages/ForgotPasswordPage";

function renderForgotPassword() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.configured = true;
    authState.sendPasswordReset.mockReset().mockResolvedValue(undefined);
  });

  it("trims the email and shows enumeration-safe success copy", async () => {
    renderForgotPassword();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "  user@example.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(authState.sendPasswordReset).toHaveBeenCalledWith("user@example.com"),
    );
    expect(
      await screen.findByText(/If an account exists for user@example.com/i),
    ).toBeInTheDocument();
  });

  it("disables submission when authentication is not configured", () => {
    authState.configured = false;
    renderForgotPassword();

    expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Authentication is not configured for this environment.",
    );
  });

  it("shows a provider failure and keeps the request form available", async () => {
    authState.sendPasswordReset.mockRejectedValue(new Error("Please wait before trying again."));
    renderForgotPassword();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait before trying again.");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("shows a busy state while the request is pending", async () => {
    let resolveRequest: (() => void) | undefined;
    authState.sendPasswordReset.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderForgotPassword();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("button", { name: "Sending link…" })).toBeDisabled();
    resolveRequest?.();
    await screen.findByText(/If an account exists for user@example.com/i);
  });
});
