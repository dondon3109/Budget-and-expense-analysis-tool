// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: {
    id: "test-user",
    email: "test@example.com",
    new_email: "pending@example.com",
    user_metadata: { display_name: "Taylor" },
  },
  updateDisplayName: vi.fn(),
  requestEmailChange: vi.fn(),
  verifyCurrentPassword: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { SettingsPage } from "../src/pages/SettingsPage";

function renderSettings(entry = "/app/settings") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    authState.user = {
      id: "test-user",
      email: "test@example.com",
      new_email: "pending@example.com",
      user_metadata: { display_name: "Taylor" },
    };
    authState.updateDisplayName.mockReset();
    authState.requestEmailChange.mockReset();
    authState.verifyCurrentPassword.mockReset();
    authState.updatePassword.mockReset();
  });

  it("shows current profile and email information", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Account Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name/)).toHaveValue("Taylor");
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending confirmation: pending@example.com")).toBeInTheDocument();
  });

  it("normalizes and saves the display name", async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText(/^Display name/), { target: { value: "  Avery  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save display name" }));

    await waitFor(() => expect(authState.updateDisplayName).toHaveBeenCalledWith("Avery"));
    expect(screen.getByRole("status")).toHaveTextContent("Display name updated.");
  });

  it("requests confirmation without presenting the new email as active", async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText(/^New email address/), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(authState.requestEmailChange).toHaveBeenCalledWith("new@example.com"));
    expect(screen.getByRole("status")).toHaveTextContent("current email stays active");
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("validates password confirmation before making auth calls", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(authState.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(authState.updatePassword).not.toHaveBeenCalled();
  });

  it("verifies the current password before updating it", async () => {
    const callOrder: string[] = [];
    authState.verifyCurrentPassword.mockImplementation(async () => {
      callOrder.push("verify");
    });
    authState.updatePassword.mockImplementation(async () => {
      callOrder.push("update");
    });
    renderSettings();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(authState.updatePassword).toHaveBeenCalledWith("new-password"));
    expect(callOrder).toEqual(["verify", "update"]);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Password updated");
  });

  it("stops when the current password cannot be verified", async () => {
    authState.verifyCurrentPassword.mockRejectedValue(new Error("Invalid credentials"));
    renderSettings();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("current password could not be verified"),
    );
    expect(authState.updatePassword).not.toHaveBeenCalled();
  });

  it("shows cautious copy after an email confirmation callback", () => {
    renderSettings("/app/settings?emailChange=confirmed");

    expect(screen.getByRole("status")).toHaveTextContent("Confirmation link processed");
    expect(screen.getByRole("status")).toHaveTextContent("complete the confirmation");
  });
});
