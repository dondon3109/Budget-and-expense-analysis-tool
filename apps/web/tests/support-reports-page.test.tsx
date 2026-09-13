// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { AdminBugReport, BugReport } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: false,
  getBugReports: vi.fn(),
  getAdminBugReports: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "person@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/hooks/useBillingSummary", () => ({
  useBillingSummary: () => ({ data: { canManageSponsoredSeats: mocks.admin } }),
}));

vi.mock("../src/lib/api", () => ({
  getBugReports: mocks.getBugReports,
  getAdminBugReports: mocks.getAdminBugReports,
  updateAdminBugReportStatus: mocks.updateStatus,
}));

import { SupportReportsPage } from "../src/pages/SupportReportsPage";

const report: BugReport = {
  id: "00000000-0000-4000-8000-000000000099",
  reference: "BR-20260812-001122334455",
  title: "Calendar event details stay empty",
  category: "ui",
  actualBehavior: "The details panel stays empty after selecting an event.",
  expectedBehavior: "The selected event details should appear.",
  stepsToReproduce: "Open Calendar, select a populated day, then select an event.",
  frequency: "always",
  pageContext: "calendar",
  diagnostics: {
    route: "/app/calendar",
    releaseVersion: "2.0.0",
    viewportWidth: 390,
    viewportHeight: 844,
    displayMode: "standalone",
    platform: "android",
  },
  status: "new",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

const adminReport: AdminBugReport = {
  ...report,
  reporterUserId: "user-1",
  reporterEmail: "person@example.com",
  notificationStatus: "sent",
  notificationAttempts: 1,
  notifiedAt: "2026-08-12T00:01:00.000Z",
};

function renderPage(entry = "/app/support/reports") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <SupportReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SupportReportsPage", () => {
  beforeEach(() => {
    mocks.admin = false;
    mocks.getBugReports.mockReset().mockResolvedValue([report]);
    mocks.getAdminBugReports.mockReset().mockResolvedValue([adminReport]);
    mocks.updateStatus.mockReset();
  });

  afterEach(cleanup);

  it("shows only the signed-in reporter's submitted report details", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Your bug reports" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: report.title })).toBeInTheDocument();
    expect(screen.getAllByText(report.reference)).toHaveLength(2);
    expect(screen.getByText(report.actualBehavior)).toBeInTheDocument();
    expect(screen.queryByText(/Reporter:/)).not.toBeInTheDocument();
  });

  it("orients a signed-in reporter under Home > Your bug reports", () => {
    renderPage();

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(breadcrumbs)
        .getAllByRole("listitem")
        .map((crumb) => crumb.textContent),
    ).toEqual(["Home", "Your bug reports"]);
    expect(within(breadcrumbs).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/app");
    expect(within(breadcrumbs).getByText("Your bug reports")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("orients the admin inbox under Home > Admin console > Bug report inbox", () => {
    mocks.admin = true;
    renderPage("/app/support/reports?view=admin");

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(breadcrumbs)
        .getAllByRole("listitem")
        .map((crumb) => crumb.textContent),
    ).toEqual(["Home", "Admin console", "Bug report inbox"]);
    expect(within(breadcrumbs).getByRole("link", { name: "Admin console" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
    expect(within(breadcrumbs).getByText("Bug report inbox")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps a non-administrator on the personal trail when the admin view is requested", () => {
    mocks.admin = false;
    renderPage("/app/support/reports?view=admin");

    expect(screen.getByRole("heading", { name: "Your bug reports" })).toBeInTheDocument();
    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(breadcrumbs)
        .getAllByRole("listitem")
        .map((crumb) => crumb.textContent),
    ).toEqual(["Home", "Your bug reports"]);
  });

  it("allows a platform administrator to triage the shared inbox", async () => {
    mocks.admin = true;
    mocks.updateStatus.mockResolvedValue({ ...adminReport, status: "in_progress" });
    renderPage("/app/support/reports?view=admin");

    expect(screen.getByRole("heading", { name: "Bug report inbox" })).toBeInTheDocument();
    expect(await screen.findByText(/Reporter: person@example.com/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "in_progress" } });

    await waitFor(() =>
      expect(mocks.updateStatus).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        report.id,
        "in_progress",
      ),
    );
  });
});
