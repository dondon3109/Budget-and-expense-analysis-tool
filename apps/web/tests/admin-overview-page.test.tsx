// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type {
  AdminBugReport,
  CustomerReviewAdminDashboard,
  SponsoredProSeatSummary,
} from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: true,
  billingError: undefined as Error | undefined,
  refetchBilling: vi.fn(),
  getSeats: vi.fn(),
  getReviews: vi.fn(),
  getHealth: vi.fn(),
  getReports: vi.fn(),
  revokeSeat: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "admin-1", email: "admin@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/hooks/useBillingSummary", () => ({
  useBillingSummary: () => ({
    isLoading: false,
    data: mocks.billingError ? undefined : { canManageSponsoredSeats: mocks.admin },
    error: mocks.billingError,
    refetch: mocks.refetchBilling,
  }),
}));

vi.mock("../src/lib/api", () => ({
  getSponsoredProSeats: mocks.getSeats,
  getAdminCustomerReviews: mocks.getReviews,
  getProviderHealth: mocks.getHealth,
  getAdminBugReports: mocks.getReports,
  addSponsoredProSeat: vi.fn(),
  inviteSponsoredProRecipient: vi.fn(),
  replaceSponsoredProSeat: vi.fn(),
  resendSponsoredProInvitation: vi.fn(),
  revokeSponsoredProSeat: mocks.revokeSeat,
  isApiRequestError: () => false,
}));

import { AdminOverviewPage } from "../src/pages/AdminOverviewPage";

const seats: SponsoredProSeatSummary = {
  capacity: 5,
  activeCount: 2,
  pendingCount: 1,
  availableCount: 2,
  seats: [
    {
      slotNumber: 1,
      state: "active",
      beneficiaryUserId: "user-2",
      invitedAt: "2026-08-01T00:00:00.000Z",
      assignedAt: "2026-08-02T00:00:00.000Z",
      canResendInvitation: false,
    },
    {
      slotNumber: 2,
      state: "active",
      beneficiaryUserId: "user-5",
      invitedAt: "2026-08-04T00:00:00.000Z",
      assignedAt: "2026-08-05T00:00:00.000Z",
      canResendInvitation: false,
    },
    {
      slotNumber: 3,
      state: "pending",
      beneficiaryUserId: null,
      invitedAt: "2026-09-01T00:00:00.000Z",
      assignedAt: null,
      canResendInvitation: true,
    },
  ],
};

const reviews: CustomerReviewAdminDashboard = {
  items: [],
  lineup: [],
  summary: { total: 12, pending: 3, published: 8, hidden: 1, featured: 2 },
  page: 1,
  pageSize: 1,
  totalFiltered: 12,
  totalPages: 12,
};

const health = {
  health: [
    {
      service: "assistant" as const,
      provider: "deepseek",
      model: "deepseek-chat",
      displayName: "DeepSeek Chat",
      hasCredential: true,
      credentialName: "DeepSeek Key",
      details: "Active configuration is resolving its credential.",
    },
    {
      service: "stt" as const,
      provider: "workers_ai",
      model: "whisper-large-v3-turbo",
      hasCredential: false,
      credentialName: null,
      details: "Workers AI binding missing.",
    },
    {
      service: "tts" as const,
      provider: "fish_audio",
      model: "s2.1-pro-free",
      hasCredential: true,
      credentialName: "Fish Audio Key",
      details: "Active configuration is resolving its credential.",
    },
  ],
};

function bugReport(id: string, status: AdminBugReport["status"]): AdminBugReport {
  return {
    id,
    reference: `ZP-${id}`,
    title: `Report ${id}`,
    category: "ui",
    actualBehavior: "The balance card showed the previous month total.",
    expectedBehavior: "The card should follow the selected month.",
    stepsToReproduce: "Open the dashboard, change the month, read the balance card.",
    frequency: "sometimes",
    pageContext: "dashboard",
    diagnostics: {
      route: "/app",
      releaseVersion: "2.30.2",
      viewportWidth: 1280,
      viewportHeight: 900,
      displayMode: "browser",
      platform: "desktop",
    },
    status,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    reporterUserId: "user-3",
    reporterEmail: "reporter@example.com",
    notificationStatus: "sent",
    notificationAttempts: 1,
    notifiedAt: "2026-09-01T00:00:00.000Z",
  };
}

function renderConsole() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin"]}>
        <AdminOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminOverviewPage", () => {
  beforeEach(() => {
    mocks.admin = true;
    mocks.billingError = undefined;
    mocks.getSeats.mockResolvedValue(seats);
    mocks.getReviews.mockResolvedValue(reviews);
    mocks.getHealth.mockResolvedValue(health);
    mocks.getReports.mockResolvedValue([
      bugReport("1", "new"),
      bugReport("2", "new"),
      bugReport("3", "resolved"),
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps every admin area off the page for a non-administrator", async () => {
    mocks.admin = false;
    renderConsole();

    expect(
      await screen.findByRole("heading", { name: "Platform administrator access required" }),
    ).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Admin areas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sponsored Pro seats" })).not.toBeInTheDocument();
    // A trail into a dead end would mislead, so the gate carries no breadcrumb.
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(mocks.getSeats).not.toHaveBeenCalled();
    expect(mocks.getReviews).not.toHaveBeenCalled();
    expect(mocks.getHealth).not.toHaveBeenCalled();
    expect(mocks.getReports).not.toHaveBeenCalled();
  });

  it("orients the console under a Home > Admin console breadcrumb", async () => {
    renderConsole();

    const breadcrumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(breadcrumbs)
        .getAllByRole("listitem")
        .map((crumb) => crumb.textContent),
    ).toEqual(["Home", "Admin console"]);
    expect(within(breadcrumbs).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/app");
    expect(within(breadcrumbs).getByText("Admin console")).toHaveAttribute("aria-current", "page");
  });

  it("shows the live state of every admin area with a way into the three that own a page", async () => {
    renderConsole();

    const rail = await screen.findByRole("navigation", { name: "Admin areas" });
    const pegs = Array.from(rail.querySelectorAll("li"));
    expect(pegs.map((peg) => peg.querySelector("h3")?.textContent)).toEqual([
      "Sponsored Pro seats",
      "Customer reviews",
      "AI & voice models",
      "Support reports",
    ]);

    await screen.findByText("Needs moderation");
    expect(pegs[0]).toHaveClass("is-held");
    expect(pegs[1]).not.toHaveClass("is-held");
    expect(pegs[0]).toHaveTextContent("1 invitation pending");
    expect(pegs[0]).toHaveTextContent("2 seats open");
    expect(pegs[0]).toHaveTextContent("Invitation waiting");
    expect(pegs[1]).toHaveTextContent("3 submissions awaiting review");
    expect(pegs[1]).toHaveTextContent("2 of 6 landing slots filled, 12 collected");
    expect(pegs[2]).toHaveTextContent("1 service without a credential");
    expect(pegs[2]).toHaveTextContent("Assistant on DeepSeek Chat");
    expect(pegs[3]).toHaveTextContent("2 new reports");
    expect(pegs[3]).toHaveTextContent("3 received in total");

    expect(screen.getByRole("link", { name: /Open moderation desk/ })).toHaveAttribute(
      "href",
      "/app/admin/reviews",
    );
    expect(screen.getByRole("link", { name: /Open model registry/ })).toHaveAttribute(
      "href",
      "/app/admin/provider-configs",
    );
    expect(screen.getByRole("link", { name: /Open report triage/ })).toHaveAttribute(
      "href",
      "/app/support/reports?view=admin",
    );
    expect(screen.getByRole("link", { name: /Manage on this page/ })).toHaveAttribute(
      "href",
      "#sponsored-pro-seats",
    );
  });

  it("keeps the sponsored seat workbench on the console floor", async () => {
    renderConsole();

    expect(await screen.findByLabelText("Recipient email")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add seat" })).toBeVisible();
    expect(screen.getByText("Workbench")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sponsored Pro seats" })).toBeVisible();

    // All five slots are visible, so the two open seats read as capacity rather than a number.
    expect(await screen.findAllByText("Open. Assign it from the form above.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Resend invitation" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Manage reviews" })).not.toBeInTheDocument();
  });

  it("reports an unreadable area instead of showing a stale count", async () => {
    mocks.getHealth.mockRejectedValue(new Error("health unavailable"));
    renderConsole();

    const rail = await screen.findByRole("navigation", { name: "Admin areas" });
    const modelsPeg = Array.from(rail.querySelectorAll("li"))[2];
    await waitFor(() => expect(modelsPeg).toHaveTextContent("Unavailable"));
    expect(modelsPeg).toHaveTextContent("State could not be read");
  });

  it("re-reads every area from the refresh action", async () => {
    renderConsole();

    await screen.findByText("Needs moderation");

    fireEvent.click(screen.getByRole("button", { name: /Refresh all/ }));

    await waitFor(() => {
      expect(mocks.getSeats).toHaveBeenCalledTimes(2);
      expect(mocks.getReviews).toHaveBeenCalledTimes(2);
      expect(mocks.getHealth).toHaveBeenCalledTimes(2);
      expect(mocks.getReports).toHaveBeenCalledTimes(2);
    });
  });

  it("asks the server again when administrator access could not be checked", async () => {
    mocks.billingError = new Error("billing unavailable");
    renderConsole();

    expect(
      await screen.findByRole("heading", { name: "Administrator access could not be checked" }),
    ).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetchBilling).toHaveBeenCalled();
  });
});
