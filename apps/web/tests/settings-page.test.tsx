// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: {
    id: "test-user",
    email: "test@example.com",
    new_email: "pending@example.com",
    identities: [{ provider: "email" }] as Array<{ provider: string }> | undefined,
    user_metadata: { display_name: "Taylor", avatar_path: undefined as string | undefined },
  },
  updateDisplayName: vi.fn(),
  updateAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  requestEmailChange: vi.fn(),
  verifyCurrentPassword: vi.fn(),
  updatePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/account/BillingSettings", () => ({
  BillingSettings: () => (
    <section id="plan-and-billing" aria-labelledby="billing-settings-title" tabIndex={-1}>
      <h2 id="billing-settings-title">Plan and billing</h2>
    </section>
  ),
}));

vi.mock("../src/components/reviews/CustomerReviewSettings", () => ({
  CustomerReviewSettings: () => (
    <section id="customer-review" aria-labelledby="customer-review-settings-title" tabIndex={-1}>
      <h2 id="customer-review-settings-title">Your customer review</h2>
    </section>
  ),
}));

import { ApiRequestError } from "../src/lib/api";
import { SettingsPage } from "../src/pages/SettingsPage";

const scrollIntoView = vi.fn();
const writeClipboardText = vi.fn();

function renderSettings(entry = "/app/settings") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  beforeEach(() => {
    window.localStorage.clear();
    scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    authState.user = {
      id: "test-user",
      email: "test@example.com",
      new_email: "pending@example.com",
      identities: [{ provider: "email" }],
      user_metadata: { display_name: "Taylor", avatar_path: undefined },
    };
    authState.updateDisplayName.mockReset();
    authState.updateAvatar.mockReset().mockResolvedValue({});
    authState.removeAvatar.mockReset().mockResolvedValue({});
    authState.requestEmailChange.mockReset();
    authState.verifyCurrentPassword.mockReset();
    authState.updatePassword.mockReset();
    authState.deleteAccount.mockReset().mockResolvedValue({ status: "deleted" });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:avatar-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    writeClipboardText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeClipboardText },
    });
  });

  it("shows current profile and email information", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Account Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name/)).toHaveValue("Taylor");
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending confirmation: pending@example.com")).toBeInTheDocument();
  });

  it.each([
    ["profile", "/app/settings#profile-settings", "profile-settings"],
    ["customer review", "/app/settings#customer-review", "customer-review"],
    ["billing", "/app/settings#plan-and-billing", "plan-and-billing"],
    ["help and contact", "/app/settings#help-and-contact", "help-and-contact"],
    ["help", "/app/settings#help", "help"],
    ["contact", "/app/settings#contact", "contact"],
    ["voice language", "/app/settings#voice-language", "voice-language"],
  ])("scrolls to and focuses the %s section from its hash", async (_label, entry, sectionId) => {
    renderSettings(entry);

    const section = document.getElementById(sectionId);
    expect(section).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(section).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("offers FAQ, chat, and resilient email support from Account Settings", async () => {
    const openSupportListener = vi.fn();
    window.addEventListener("zoption:open-support-chat", openSupportListener, { once: true });
    renderSettings();

    expect(screen.getByRole("heading", { name: "Help & contact" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse FAQ" })).toHaveAttribute("href", "/faq");
    expect(screen.getByRole("link", { name: "View reports" })).toHaveAttribute(
      "href",
      "/app/support/reports",
    );
    const copyEmailButton = screen.getByRole("button", { name: "Copy email address" });
    fireEvent.click(copyEmailButton);
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith("support@zoption.site"));
    expect(screen.getByRole("button", { name: "Email copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Paste it into the To field in your email app",
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask Zoption" }));
    expect(openSupportListener).toHaveBeenCalledOnce();
  });

  it("shows the support address when clipboard access is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Copy email address" }));

    expect(screen.getByRole("status")).toHaveTextContent("copy support@zoption.site manually");
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

  it("reveals each password field independently", () => {
    renderSettings();

    const currentPassword = screen.getByLabelText("Current password");
    const newPassword = screen.getByLabelText("New password");
    const confirmPassword = screen.getByLabelText("Confirm new password");
    fireEvent.click(screen.getByRole("button", { name: "Show current password" }));

    expect(currentPassword).toHaveAttribute("type", "text");
    expect(newPassword).toHaveAttribute("type", "password");
    expect(confirmPassword).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show new password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show confirm new password" })).toBeInTheDocument();
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

  it("lets a provider-only account create a password without asking for one it does not have", async () => {
    authState.user.identities = [{ provider: "google" }];
    renderSettings();

    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(screen.getByText(/Create a password above before deleting/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Budgeting-2026!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create password" }));

    await waitFor(() => expect(authState.updatePassword).toHaveBeenCalledWith("Budgeting-2026!"));
    expect(authState.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Password created");
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

  it("requires a password and exact acknowledgement before deleting an account", async () => {
    renderSettings();

    const trigger = screen.getByRole("button", { name: "Delete account" });
    fireEvent.click(trigger);

    const dialog = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".account-deletion-dialog");
      if (!element) throw new Error("Account deletion dialog was not rendered.");
      return element;
    });
    const dialogQueries = within(dialog);
    expect(dialog).toBeInTheDocument();
    expect(
      dialogQueries.getByRole("button", { name: "Permanently delete account" }),
    ).toBeDisabled();
    expect(document.body).toHaveStyle({ overflow: "hidden" });

    fireEvent.change(dialogQueries.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(dialogQueries.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(
      dialogQueries.getByRole("button", { name: "Permanently delete account" }),
    ).toBeDisabled();

    fireEvent.change(dialogQueries.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(dialogQueries.getByRole("button", { name: "Permanently delete account" }));

    await waitFor(() => expect(authState.deleteAccount).toHaveBeenCalledWith("current-password"));
  });

  it("shows a generic deletion failure and restores focus after cancellation", async () => {
    authState.deleteAccount.mockRejectedValue(
      new Error("The current password could not be verified."),
    );
    renderSettings();

    const trigger = screen.getByRole("button", { name: "Delete account" });
    fireEvent.click(trigger);
    const dialog = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".account-deletion-dialog");
      if (!element) throw new Error("Account deletion dialog was not rendered.");
      return element;
    });
    const dialogQueries = within(dialog);
    fireEvent.change(dialogQueries.getByLabelText("Current password"), {
      target: { value: "wrong" },
    });
    fireEvent.change(dialogQueries.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(dialogQueries.getByRole("button", { name: "Permanently delete account" }));

    await waitFor(() =>
      expect(dialogQueries.getByRole("alert")).toHaveTextContent(
        "current password could not be verified",
      ),
    );
    fireEvent.click(dialogQueries.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps account deletion open and points blocked subscribers to billing", async () => {
    authState.deleteAccount.mockRejectedValue(
      new ApiRequestError(
        "Cancel or resolve your subscription before deleting your account.",
        409,
        "subscription_blocks_account_deletion",
      ),
    );
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".account-deletion-dialog");
      if (!element) throw new Error("Account deletion dialog was not rendered.");
      return element;
    });
    const dialogQueries = within(dialog);
    fireEvent.change(dialogQueries.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(dialogQueries.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(dialogQueries.getByRole("button", { name: "Permanently delete account" }));

    await waitFor(() =>
      expect(dialogQueries.getByRole("alert")).toHaveTextContent("before deleting your account"),
    );
    expect(dialog).toBeInTheDocument();
    expect(
      dialogQueries.getByRole("button", { name: "Review Plan and billing" }),
    ).toBeInTheDocument();
    expect(
      dialogQueries.getByRole("button", { name: "Permanently delete account" }),
    ).toBeDisabled();
  });

  it("shows cautious copy after an email confirmation callback", () => {
    renderSettings("/app/settings?emailChange=confirmed");

    expect(screen.getByRole("status")).toHaveTextContent("Confirmation link processed");
    expect(screen.getByRole("status")).toHaveTextContent("complete the confirmation");
  });

  it("renders data portability section and triggers full account archive export", async () => {
    const api = await import("../src/lib/api");
    const downloadSpy = vi.spyOn(api, "downloadAccountArchive").mockResolvedValue(undefined);

    renderSettings();

    const heading = screen.getByRole("heading", { name: "Data portability & backup" });
    expect(heading).toBeInTheDocument();

    const exportBtn = screen.getByRole("button", { name: "Download full account archive (.json)" });
    expect(exportBtn).toBeInTheDocument();

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Account archive downloaded successfully.");
    });
  });

  it("renders Voice Language setting with Auto as default mode", () => {
    renderSettings();

    const heading = screen.getByRole("heading", { name: "Voice language" });
    expect(heading).toBeInTheDocument();

    const autoRadio = screen.getByRole("radio", { name: /^Auto/i });
    const englishRadio = screen.getByRole("radio", { name: /^English/i });
    const tagalogRadio = screen.getByRole("radio", { name: /^Tagalog/i });

    expect(autoRadio).toBeInTheDocument();
    expect(englishRadio).toBeInTheDocument();
    expect(tagalogRadio).toBeInTheDocument();

    expect(autoRadio).toHaveAttribute("aria-checked", "true");
    expect(autoRadio).toHaveClass("selected");
    expect(englishRadio).toHaveAttribute("aria-checked", "false");
    expect(englishRadio).not.toHaveClass("selected");
    expect(tagalogRadio).toHaveAttribute("aria-checked", "false");
    expect(tagalogRadio).not.toHaveClass("selected");
  });

  it("allows switching voice language between Auto, English, and Tagalog in Account Settings", () => {
    renderSettings();

    const autoRadio = screen.getByRole("radio", { name: /^Auto/i });
    const englishRadio = screen.getByRole("radio", { name: /^English/i });
    const tagalogRadio = screen.getByRole("radio", { name: /^Tagalog/i });

    fireEvent.click(tagalogRadio);
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("fil");
    expect(tagalogRadio).toHaveAttribute("aria-checked", "true");
    expect(tagalogRadio).toHaveClass("selected");
    expect(autoRadio).toHaveAttribute("aria-checked", "false");
    expect(englishRadio).toHaveAttribute("aria-checked", "false");

    fireEvent.click(englishRadio);
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("en");
    expect(englishRadio).toHaveAttribute("aria-checked", "true");
    expect(englishRadio).toHaveClass("selected");
    expect(tagalogRadio).toHaveAttribute("aria-checked", "false");

    fireEvent.click(autoRadio);
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("auto");
    expect(autoRadio).toHaveAttribute("aria-checked", "true");
    expect(autoRadio).toHaveClass("selected");
    expect(englishRadio).toHaveAttribute("aria-checked", "false");
  });

  it("syncs Voice Language setting when zoption-voice-lang-change event fires", async () => {
    renderSettings();

    const autoRadio = screen.getByRole("radio", { name: /^Auto/i });
    const englishRadio = screen.getByRole("radio", { name: /^English/i });
    const tagalogRadio = screen.getByRole("radio", { name: /^Tagalog/i });

    expect(autoRadio).toHaveAttribute("aria-checked", "true");

    fireEvent(window, new CustomEvent("zoption-voice-lang-change", { detail: "fil" }));

    await waitFor(() => {
      expect(tagalogRadio).toHaveAttribute("aria-checked", "true");
      expect(tagalogRadio).toHaveClass("selected");
      expect(autoRadio).toHaveAttribute("aria-checked", "false");
    });

    fireEvent(window, new CustomEvent("zoption-voice-lang-change", { detail: "en" }));

    await waitFor(() => {
      expect(englishRadio).toHaveAttribute("aria-checked", "true");
      expect(englishRadio).toHaveClass("selected");
      expect(tagalogRadio).toHaveAttribute("aria-checked", "false");
    });
  });

  it("supports keyboard arrow navigation and roving tabindex in Voice Language radiogroup", () => {
    renderSettings();

    const autoRadio = screen.getByRole("radio", { name: /^Auto/i });
    const englishRadio = screen.getByRole("radio", { name: /^English/i });
    const tagalogRadio = screen.getByRole("radio", { name: /^Tagalog/i });

    // Initial state: Auto is selected (tabIndex=0), others are tabIndex=-1
    expect(autoRadio).toHaveAttribute("tabindex", "0");
    expect(englishRadio).toHaveAttribute("tabindex", "-1");
    expect(tagalogRadio).toHaveAttribute("tabindex", "-1");

    // ArrowRight moves to English
    fireEvent.keyDown(autoRadio, { key: "ArrowRight" });
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("en");
    expect(englishRadio).toHaveAttribute("aria-checked", "true");
    expect(englishRadio).toHaveAttribute("tabindex", "0");
    expect(autoRadio).toHaveAttribute("tabindex", "-1");

    // ArrowDown moves to Tagalog
    fireEvent.keyDown(englishRadio, { key: "ArrowDown" });
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("fil");
    expect(tagalogRadio).toHaveAttribute("aria-checked", "true");
    expect(tagalogRadio).toHaveAttribute("tabindex", "0");

    // ArrowLeft moves back to English
    fireEvent.keyDown(tagalogRadio, { key: "ArrowLeft" });
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("en");
    expect(englishRadio).toHaveAttribute("aria-checked", "true");

    // Home moves to Auto (first option)
    fireEvent.keyDown(englishRadio, { key: "Home" });
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("auto");
    expect(autoRadio).toHaveAttribute("aria-checked", "true");

    // End moves to Tagalog (last option)
    fireEvent.keyDown(autoRadio, { key: "End" });
    expect(window.localStorage.getItem("zoption_voice_language")).toBe("fil");
    expect(tagalogRadio).toHaveAttribute("aria-checked", "true");
  });

  it("syncs Voice Language setting when storage event fires from another tab", async () => {
    renderSettings();

    const autoRadio = screen.getByRole("radio", { name: /^Auto/i });
    const englishRadio = screen.getByRole("radio", { name: /^English/i });
    const tagalogRadio = screen.getByRole("radio", { name: /^Tagalog/i });

    expect(autoRadio).toHaveAttribute("aria-checked", "true");

    // Simulate cross-tab storage change to Tagalog
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "zoption_voice_language",
        newValue: "fil",
      }),
    );

    await waitFor(() => {
      expect(tagalogRadio).toHaveAttribute("aria-checked", "true");
      expect(tagalogRadio).toHaveClass("selected");
      expect(autoRadio).toHaveAttribute("aria-checked", "false");
    });

    // Simulate cross-tab storage change to English
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "zoption_voice_language",
        newValue: "en",
      }),
    );

    await waitFor(() => {
      expect(englishRadio).toHaveAttribute("aria-checked", "true");
      expect(englishRadio).toHaveClass("selected");
      expect(tagalogRadio).toHaveAttribute("aria-checked", "false");
    });
  });
});
