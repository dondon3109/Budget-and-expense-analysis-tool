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
    user_metadata: { display_name: "Taylor", avatar_path: undefined as string | undefined },
  },
  updateDisplayName: vi.fn(),
  updateAvatar: vi.fn(),
  removeAvatar: vi.fn(),
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
      user_metadata: { display_name: "Taylor", avatar_path: undefined },
    };
    authState.updateDisplayName.mockReset();
    authState.updateAvatar.mockReset().mockResolvedValue({});
    authState.removeAvatar.mockReset().mockResolvedValue({});
    authState.requestEmailChange.mockReset();
    authState.verifyCurrentPassword.mockReset();
    authState.updatePassword.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:avatar-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("shows current profile and email information", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Account Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name/)).toHaveValue("Taylor");
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending confirmation: pending@example.com")).toBeInTheDocument();
  });

  it("uploads a validated profile picture", async () => {
    renderSettings();
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText(/Choose a profile picture/), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save picture" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save picture" }));

    await waitFor(() => expect(authState.updateAvatar).toHaveBeenCalledWith(file));
    expect(screen.getByRole("status")).toHaveTextContent("Profile picture updated");
  });

  it("rejects unsupported profile picture formats", async () => {
    renderSettings();
    const file = new File(["avatar"], "avatar.svg", { type: "image/svg+xml" });

    fireEvent.change(screen.getByLabelText(/Choose a profile picture/), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG, or WebP"));
    expect(authState.updateAvatar).not.toHaveBeenCalled();
  });

  it("removes the current profile picture", async () => {
    authState.user.user_metadata.avatar_path = "test-user/existing.png";
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));

    await waitFor(() => expect(authState.removeAvatar).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Profile picture removed");
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

    await waitFor(() =>
      expect(authState.requestEmailChange).toHaveBeenCalledWith("new@example.com"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("current email stays active");
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("validates password confirmation before making auth calls", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Budgeting-2026?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(authState.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(authState.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password that misses the shared policy", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "longpassword" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "longpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("meet every requirement");
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
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(authState.updatePassword).toHaveBeenCalledWith("Budgeting-2026!"));
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
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Budgeting-2026!" },
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
