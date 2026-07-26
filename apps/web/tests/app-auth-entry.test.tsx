// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/pages/LandingPage", () => ({
  LandingPage: () => <div>Marketing landing page</div>,
}));

vi.mock("../src/pages/AuthCallbackPage", () => ({
  AuthCallbackPage: () => <div>Account callback</div>,
}));

import { App } from "../src/App";

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

describe("root authentication entry", () => {
  afterEach(cleanup);

  it("routes the reported expired recovery URL to the safe renewal flow", async () => {
    renderApp(
      "/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=",
    );

    expect(await screen.findByText("Account callback")).toBeInTheDocument();
    const location = screen.getByTestId("current-location");
    expect(location).toHaveTextContent("/auth/callback?next=%2Fupdate-password");
    expect(location).not.toHaveTextContent("otp_expired");
    expect(location).not.toHaveTextContent("error_description");
  });

  it.each([
    "/?error=access_denied&error_code=otp_expired",
    "/#error=access_denied&error_code=otp_expired",
  ])("routes root auth errors from %s to the callback", async (initialEntry) => {
    renderApp(initialEntry);

    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        "/auth/callback?next=%2Fupdate-password",
      ),
    );
    expect(screen.getByTestId("current-location").textContent).not.toContain("#");
  });

  it("routes a root PKCE code to the callback without forwarding unrelated values", async () => {
    renderApp("/?code=recovery-code&utm_source=email#ignored");

    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        "/auth/callback?code=recovery-code",
      ),
    );
    expect(screen.getByTestId("current-location").textContent).not.toContain("utm_source");
    expect(screen.getByTestId("current-location").textContent).not.toContain("ignored");
    expect(screen.getByTestId("current-location").textContent).not.toContain("next=");
  });

  it("gives an auth error precedence over a code", async () => {
    renderApp("/?code=unused-code&error=access_denied");

    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        "/auth/callback?next=%2Fupdate-password",
      ),
    );
    expect(screen.getByTestId("current-location").textContent).not.toContain("unused-code");
  });

  it.each(["/", "/?utm_source=email#features"])(
    "preserves ordinary landing visits for %s",
    async (initialEntry) => {
      renderApp(initialEntry);

      expect(await screen.findByText("Marketing landing page")).toBeInTheDocument();
      expect(screen.getByTestId("current-location")).toHaveTextContent(initialEntry);
    },
  );
});
