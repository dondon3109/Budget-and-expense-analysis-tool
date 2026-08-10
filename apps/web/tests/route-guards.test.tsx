// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ loading: false, user: null as { id: string } | null }));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

import { PublicOnly, RequireAuth } from "../src/auth/RouteGuards";

function Location() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

describe("auth route guards", () => {
  beforeEach(() => {
    authState.loading = false;
    authState.user = null;
  });

  afterEach(cleanup);

  it("shows a workspace status while restoring a private session", () => {
    authState.loading = true;
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <RequireAuth>
          <div>Private dashboard</div>
        </RequireAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText("Restoring your workspace")).toHaveTextContent(
      "Restoring your workspace",
    );
    expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
  });

  it("shows a session status before rendering public-only content", () => {
    authState.loading = true;
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <PublicOnly>
          <div>Login form</div>
        </PublicOnly>
      </MemoryRouter>,
    );

    expect(screen.getByText("Checking your session")).toBeInTheDocument();
    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
  });

  it("sends signed-out users to login with their private destination", () => {
    render(
      <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
        <Routes>
          <Route
            path="/app/budgets"
            element={
              <RequireAuth>
                <div>Private budgets</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/redirectTo=%2Fapp%2Fbudgets%3Fmonth%3D2026-07/)).toBeInTheDocument();
  });

  it("preserves a signed-out subscriptions destination", () => {
    render(
      <MemoryRouter initialEntries={["/app/subscriptions"]}>
        <Routes>
          <Route
            path="/app/subscriptions"
            element={
              <RequireAuth>
                <div>Private subscriptions</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/redirectTo=%2Fapp%2Fsubscriptions/)).toBeInTheDocument();
  });

  it("preserves a signed-out account settings destination", () => {
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <Routes>
          <Route
            path="/app/settings"
            element={
              <RequireAuth>
                <div>Private settings</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/redirectTo=%2Fapp%2Fsettings/)).toBeInTheDocument();
  });

  it("renders private content immediately once authentication has resolved", () => {
    authState.user = { id: "user-1" };
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <RequireAuth>
          <div>Private dashboard</div>
        </RequireAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText("Private dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Restoring your workspace")).not.toBeInTheDocument();
  });

  it("redirects signed-in users away from public-only auth pages", () => {
    authState.user = { id: "user-1" };
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <div>Login form</div>
              </PublicOnly>
            }
          />
          <Route path="/app" element={<div>Private overview</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Private overview")).toBeInTheDocument();
    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
  });
});
