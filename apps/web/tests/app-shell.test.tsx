// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/components/layout/AppShell";
import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { ThemeProvider } from "../src/theme/ThemeProvider";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "test-user",
      email: "test@example.com",
      user_metadata: { display_name: "Taylor", avatar_path: "test-user/avatar.png" },
    },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/avatar.png" } }),
      }),
    },
  },
}));

describe("AppShell", () => {
  afterEach(cleanup);

  it("places the profile above navigation and Subscriptions below Budgets", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/subscriptions"]}>
            <AppShell>
              <div>Subscriptions content</div>
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(
      Array.from(navigation.querySelectorAll("a")).map((link) => link.textContent?.trim()),
    ).toEqual([
      "Profile",
      "Assistant",
      "Calendar",
      "Transactions",
      "Import",
      "Budgets",
      "Subscriptions",
    ]);
    expect(screen.getByRole("link", { name: "Subscriptions" })).toHaveClass("current");
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
      "aria-controls",
      "primary-navigation",
    );
    expect(screen.queryByText("Personal workspace")).not.toBeInTheDocument();
    const profile = document.querySelector(".sidebar-profile");
    expect(profile).toBeInstanceOf(HTMLElement);
    if (!(profile instanceof HTMLElement)) throw new Error("Sidebar profile was not rendered.");
    expect(profile.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText("Signed in as")).toBeInTheDocument();
    expect(screen.getByText("Taylor")).toBeInTheDocument();
    expect(screen.queryByText("test@example.com")).not.toBeInTheDocument();
    expect(document.querySelector(".sidebar-profile img")).toHaveAttribute(
      "src",
      "https://example.com/avatar.png",
    );
    expect(profile.querySelector(".theme-menu")).not.toBeNull();
    expect(document.querySelector(".sidebar-account .theme-menu")).toBeNull();
    expect(document.querySelector(".sidebar-profile-divider")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
    expect(
      screen.getAllByRole("button", { name: /choose theme\. current theme: (light|dark|coffee)/i }),
    ).toHaveLength(2);
  });

  it("marks account settings as current without adding it to main navigation", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/settings"]}>
            <AppShell>
              <div>Settings content</div>
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    expect(screen.getByRole("link", { name: "Account settings" })).toHaveClass("current");
    expect(
      Array.from(
        screen.getByRole("navigation", { name: "Main navigation" }).querySelectorAll("a"),
      ).map((link) => link.textContent?.trim()),
    ).toEqual([
      "Profile",
      "Assistant",
      "Calendar",
      "Transactions",
      "Import",
      "Budgets",
      "Subscriptions",
    ]);
  });
});
