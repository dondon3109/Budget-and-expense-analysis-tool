// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy, StrictMode, useEffect, useState, type ReactElement } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted<{ loading: boolean; user: { id: string } | null }>(() => ({
  loading: false,
  user: { id: "user-1" },
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/components/layout/FullPageLoadingStatus", () => ({
  FullPageLoadingStatus: ({ title, onComplete }: { title: string; onComplete?: () => void }) => (
    <section role="status" aria-label={title}>
      <span>{title}</span>
      <button type="button" onClick={onComplete}>
        Finish minimum duration
      </button>
    </section>
  ),
}));

vi.mock("../src/components/layout/InlineLoader", () => ({
  InlineLoader: ({ label }: { label: string }) => <div role="status">{label}</div>,
}));

import { InitialDashboardExperienceProvider } from "../src/components/dashboard/InitialDashboardExperienceProvider";
import {
  PrivateAppStartupGate,
  usePrivateAppStartupReadiness,
} from "../src/components/layout/PrivateAppStartupGate";

function DashboardProbe() {
  const reportSettled = usePrivateAppStartupReadiness();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    reportSettled(settled);
    return () => reportSettled(false);
  }, [reportSettled, settled]);

  return (
    <div>
      <p>Dashboard content</p>
      <button type="button" onClick={() => setSettled(true)}>
        Settle dashboard
      </button>
      <Link to="/app/settings">Settings</Link>
    </div>
  );
}

function renderPrivateRoutes(settingsElement = <p>Settings content</p>, initialEntry = "/app") {
  return render(
    <StrictMode>
      <InitialDashboardExperienceProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/app" element={<PrivateAppStartupGate />}>
              <Route index element={<DashboardProbe />} />
              <Route path="settings" element={settingsElement} />
            </Route>
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </MemoryRouter>
      </InitialDashboardExperienceProvider>
    </StrictMode>,
  );
}

describe("PrivateAppStartupGate", () => {
  beforeEach(() => {
    authState.loading = false;
    authState.user = { id: "user-1" };
  });

  afterEach(cleanup);

  it("keeps one loader mounted until the minimum duration and dashboard data settle", async () => {
    renderPrivateRoutes();

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAccessibleName("Restoring your workspace");
    expect(
      screen.getByText("Dashboard content").closest(".private-app-startup-content"),
    ).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "Finish minimum duration" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Settle dashboard", hidden: true }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(
      screen.getByText("Dashboard content").closest(".private-app-startup-content"),
    ).not.toHaveAttribute("aria-hidden");

    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(await screen.findByText("Settings content")).toBeInTheDocument();
    expect(screen.queryByText("Restoring your workspace")).not.toBeInTheDocument();
  });

  it("does not release or replace the loader while a private lazy route is suspended", async () => {
    let resolveSettings: ((module: { default: () => ReactElement }) => void) | undefined;
    const LazySettings = lazy(
      () =>
        new Promise<{ default: () => ReactElement }>((resolve) => {
          resolveSettings = resolve;
        }),
    );

    renderPrivateRoutes(<LazySettings />, "/app/settings");

    expect(screen.getAllByRole("status")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Finish minimum duration" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAccessibleName("Restoring your workspace");

    await act(async () => {
      resolveSettings?.({ default: () => <p>Lazy settings content</p> });
      await Promise.resolve();
    });

    expect(await screen.findByText("Lazy settings content")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
