// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
