// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  updatePassword: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/components/auth/AuthLayout", () => ({
  AuthLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

import { UpdatePasswordPage } from "../src/pages/UpdatePasswordPage";

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

function renderUpdatePassword() {
  return render(
    <MemoryRouter initialEntries={["/update-password"]}>
      <UpdatePasswordPage />
      <CurrentPath />
    </MemoryRouter>,
  );
}

describe("UpdatePasswordPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.updatePassword.mockReset().mockResolvedValue(undefined);
  });

  it("rejects an incomplete password policy before updating", () => {
    renderUpdatePassword();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "longpassword" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "longpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(authState.updatePassword).not.toHaveBeenCalled();
    expect(screen.getByText("Use a password that meets every requirement.")).toBeInTheDocument();
  });

  it("requires matching confirmation before updating", () => {
    renderUpdatePassword();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Budgeting-2026?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(authState.updatePassword).not.toHaveBeenCalled();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("updates with a valid password and returns to the app", async () => {
    renderUpdatePassword();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(authState.updatePassword).toHaveBeenCalledWith("Budgeting-2026!"));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/app"));
  });
});
