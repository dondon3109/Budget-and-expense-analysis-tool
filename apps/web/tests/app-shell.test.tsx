// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../src/components/layout/AppShell";
import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { useUnsavedChangesWarning } from "../src/hooks/useUnsavedChangesWarning";
import { ThemeProvider } from "../src/theme/ThemeProvider";

const mocks = vi.hoisted(() => ({ canManageSponsoredSeats: false, signOut: vi.fn() }));

vi.mock("../src/hooks/useBillingSummary", () => ({
  useBillingSummary: () => ({ data: { canManageSponsoredSeats: mocks.canManageSponsoredSeats } }),
}));

vi.mock("../src/components/reviews/CustomerReviewPrompt", () => ({
  CustomerReviewPrompt: () => <div>Review prompt</div>,
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "test-user",
      email: "test@example.com",
      user_metadata: { display_name: "Taylor", avatar_path: "test-user/avatar.png" },
    },
    signOut: mocks.signOut,
  }),
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: {},
}));

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{`${location.pathname}${location.hash}`}</output>;
}

/** Stands in for a page such as BudgetsPage that registers unsaved edits with the guard. */
function DirtyPage() {
  useUnsavedChangesWarning(true);
  return <div>Draft editor</div>;
}

function renderShell(initialEntry: string, page?: ReactNode) {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppShell>
            {page}
            <CurrentLocation />
          </AppShell>
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    mocks.canManageSponsoredSeats = false;
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
  });

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
      "Home",
      "Assistant",
      "Calendar",
      "Transactions",
      "Import",
      "Budgets",
      "Goals & debt",
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
    expect(screen.getByRole("link", { name: "Open profile settings" })).toHaveAttribute(
      "href",
      "/app/settings#profile-settings",
    );
    expect(document.querySelector(".sidebar-profile img")).toHaveAttribute(
      "src",
      "/api/public/avatars/test-user/avatar.png",
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
    expect(screen.getByRole("button", { name: "Open Zoption Support" })).toBeInTheDocument();
  });

  it("adds the admin console only for the platform administrator", () => {
    mocks.canManageSponsoredSeats = true;
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/admin"]}>
            <AppShell>
              <div>Admin console content</div>
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/app/admin");
    expect(screen.getByRole("link", { name: "Admin" })).toHaveClass("current");
    expect(screen.queryByText("Review prompt")).not.toBeInTheDocument();

    mocks.canManageSponsoredSeats = false;
    cleanup();
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

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByText("Review prompt")).toBeInTheDocument();

    mocks.canManageSponsoredSeats = true;
    cleanup();
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

    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText("Review prompt")).toBeInTheDocument();
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
      "Home",
      "Assistant",
      "Calendar",
      "Transactions",
      "Import",
      "Budgets",
      "Goals & debt",
      "Subscriptions",
    ]);
  });

  it("keeps Zoption Support off the Assistant dashboard so the composer stays clear", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/assistant"]}>
            <AppShell>
              <div>Assistant content</div>
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    expect(screen.queryByRole("button", { name: "Open Zoption Support" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assistant" })).toHaveClass("current");
  });

  it("promotes the assistant to the mobile tab bar and keeps calendar in the drawer", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/assistant"]}>
            <AppShell>
              <div>Assistant content</div>
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    const mobileNavigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(
      Array.from(mobileNavigation.querySelectorAll("a")).map((link) => link.textContent?.trim()),
    ).toEqual(["Home", "Transactions", "Budgets", "Assistant"]);
    expect(within(mobileNavigation).getByRole("link", { name: "Assistant tab" })).toHaveAttribute(
      "href",
      "/app/assistant",
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Assistant tab" })).toHaveClass(
      "current",
    );
    expect(mobileNavigation.querySelector('a[href="/app/calendar"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Open menu" })).not.toHaveClass("current");

    // Calendar only lost its tab slot, not its place in the drawer navigation.
    const drawerNavigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(drawerNavigation).getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/calendar",
    );
  });

  it("offers thumb-friendly primary navigation and an accessible mobile menu", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/calendar"]}>
            <AppShell>
              <div>Calendar content</div>
              <CurrentLocation />
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    // Calendar is no longer a tab destination, so the More tab carries the current state.
    expect(menuButton).toHaveClass("current");

    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(menuButton).toHaveClass("current");
    expect(document.querySelector(".sidebar")).toHaveClass("open");
    expect(document.body).toHaveStyle({ overflow: "hidden" });

    const drawer = document.querySelector(".sidebar-drawer");
    if (!(drawer instanceof HTMLElement)) throw new Error("Drawer content was not rendered.");
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(document.querySelector(".sidebar")).not.toHaveClass("open");

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Open profile settings" }));
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings#profile-settings",
    );
    expect(document.querySelector(".sidebar")).not.toHaveClass("open");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("confines Tab to the open drawer and returns focus to the More button on Escape", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter initialEntries={["/app/transactions"]}>
            <AppShell>
              <div>Transactions content</div>
            </AppShell>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(menuButton);

    const drawer = document.querySelector(".sidebar-drawer");
    if (!(drawer instanceof HTMLElement)) throw new Error("Drawer content was not rendered.");
    const firstTarget = drawer.querySelector<HTMLElement>(".mobile-menu-header button");
    const lastTarget = drawer.querySelector<HTMLElement>(".back-link");
    if (!firstTarget || !lastTarget) throw new Error("Drawer focus targets were not rendered.");

    // Opening the drawer claims focus, rather than leaving it on the page behind it.
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(firstTarget);

    lastTarget.focus();
    fireEvent.keyDown(drawer, { key: "Tab" });
    expect(document.activeElement).toBe(firstTarget);

    firstTarget.focus();
    fireEvent.keyDown(drawer, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastTarget);

    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(document.querySelector(".sidebar")).not.toHaveClass("open");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(menuButton);
  });

  it("asks before a shell link discards a page's unsaved edits", () => {
    renderShell("/app/budgets", <DirtyPage />);

    fireEvent.click(screen.getByRole("link", { name: "Transactions" }));

    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent("/app/budgets");
    expect(screen.getByText("Draft editor")).toBeInTheDocument();

    const transactionsLink = screen.getByRole("link", { name: "Transactions" });
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent("/app/budgets");
    // Cancelling hands focus back to the control that asked the question.
    expect(document.activeElement).toBe(transactionsLink);

    fireEvent.click(screen.getByRole("link", { name: "Transactions" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByTestId("current-location")).toHaveTextContent("/app/transactions");
  });

  it("guards the mobile tab bar and sign-out while a page has unsaved edits", () => {
    renderShell("/app/budgets", <DirtyPage />);

    fireEvent.click(screen.getByRole("link", { name: "Transactions tab" }));
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard and sign out" }));

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("follows shell links immediately when no page has registered unsaved edits", () => {
    renderShell("/app/budgets");

    fireEvent.click(screen.getByRole("link", { name: "Transactions" }));

    expect(screen.getByTestId("current-location")).toHaveTextContent("/app/transactions");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
