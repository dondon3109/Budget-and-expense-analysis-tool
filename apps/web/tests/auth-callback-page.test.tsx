// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The auth context the page reads, as a subscribable snapshot: a session that lands
 * after the failure was reported has to re-render the page exactly as the provider
 * would.
 */
const authState = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn();
  const listeners = new Set<() => void>();
  let snapshot: {
    exchangeCodeForSession: typeof exchangeCodeForSession;
    loading: boolean;
    user: unknown;
  } = { exchangeCodeForSession, loading: false, user: null };

  return {
    exchangeCodeForSession,
    getSnapshot: () => snapshot,
    set(patch: Partial<typeof snapshot>) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock("../src/auth/AuthProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useAuth: () => useSyncExternalStore(authState.subscribe, authState.getSnapshot) };
});

vi.mock("../src/components/auth/AuthLayout", () => ({
  AuthLayout: ({
    title,
    description,
    children,
    footer,
  }: {
    title: string;
    description: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
      {footer}
    </main>
  ),
}));

import { AuthCallbackPage, SIGN_IN_HANDOFF_MS } from "../src/pages/AuthCallbackPage";

/** A span, not an <output>: that element carries an implicit "status" role. */
function CurrentLocation() {
  const location = useLocation();
  return <span data-testid="current-location">{`${location.pathname}${location.search}`}</span>;
}

function renderCallback(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthCallbackPage />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

/** Let the exchange settle and the handoff hold elapse. */
async function completeHandoff() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SIGN_IN_HANDOFF_MS);
  });
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authState.exchangeCodeForSession
      .mockReset()
      .mockResolvedValue({ status: "signed_in", isPasswordRecovery: false });
    authState.set({ loading: false, user: null });
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("shows the branded loading surface while the handoff runs", () => {
    renderCallback("/auth/callback?code=confirmation-code");

    expect(screen.getByText("Completing secure sign-in")).toBeInTheDocument();
    expect(screen.getByText("Zoption Platform")).toBeInTheDocument();
    // Sign-in has a known next step, so the rail reports it rather than guessing.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("Checking your session")).toBeInTheDocument();
  });

  it("holds the loading surface for the full handoff before leaving", async () => {
    renderCallback("/auth/callback?code=confirmation-code&next=%2Fapp%2Fsettings");

    // The session is already exchanged here; only the hold is outstanding.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("current-location")).not.toHaveTextContent("/app/settings");

    await completeHandoff();

    expect(screen.getByTestId("current-location")).toHaveTextContent("/app/settings");
  });

  it("routes recovery codes to the password form even without a next parameter", async () => {
    authState.exchangeCodeForSession.mockResolvedValue({
      status: "signed_in",
      isPasswordRecovery: true,
    });
    renderCallback("/auth/callback?code=recovery-code");

    await completeHandoff();

    expect(authState.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(screen.getByTestId("current-location")).toHaveTextContent("/update-password");
  });

  it("uses a safe requested destination for non-recovery account links", async () => {
    renderCallback("/auth/callback?code=confirmation-code&next=%2Fapp%2Fsettings");

    await completeHandoff();

    expect(screen.getByTestId("current-location")).toHaveTextContent("/app/settings");
  });

  it("restores a social sign-in destination without changing the allow-listed callback URL", async () => {
    sessionStorage.setItem("zoption-social-auth-destination", "/app/settings?section=billing");
    renderCallback("/auth/callback?code=social-code");

    await completeHandoff();

    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings?section=billing",
    );
    expect(sessionStorage.getItem("zoption-social-auth-destination")).toBeNull();
  });

  it.each(["https%3A%2F%2Fevil.example", "%2F%2Fevil.example"])(
    "falls back to the app for unsafe next destination %s",
    async (next) => {
      renderCallback(`/auth/callback?code=confirmation-code&next=${next}`);

      await completeHandoff();

      expect(screen.getByTestId("current-location")).toHaveTextContent("/app");
    },
  );

  it("offers a new reset link when the recovery callback has no code", () => {
    renderCallback("/auth/callback?next=%2Fupdate-password");

    expect(screen.getByRole("heading", { name: "Request a new reset link" })).toBeInTheDocument();
    expect(screen.getByText(/invalid, expired, or has already been used/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send a new reset link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it.each(["reported", "thrown"] as const)(
    "shows a %s exchange failure without holding the loader",
    async (failureKind) => {
      const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const failure = new Error("provider detail");
      if (failureKind === "reported") {
        authState.exchangeCodeForSession.mockResolvedValue({ status: "failed", error: failure });
      } else {
        authState.exchangeCodeForSession.mockRejectedValue(failure);
      }
      renderCallback("/auth/callback?code=expired&next=%2Fupdate-password");

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: "Request a new reset link" })).toBeInTheDocument();
      expect(screen.queryByText("Completing secure sign-in")).not.toBeInTheDocument();
      expect(screen.queryByText(/provider detail/i)).not.toBeInTheDocument();
      // The page stays generic, so the reported cause has to reach the console.
      expect(report).toHaveBeenCalledWith("Sign-in code exchange failed.", failure);
    },
  );

  it("enters the app when the code was spent and the session is still live", async () => {
    authState.exchangeCodeForSession.mockResolvedValue({ status: "already_signed_in" });
    sessionStorage.setItem("zoption-social-auth-destination", "/app/settings?section=billing");
    renderCallback("/auth/callback?code=spent-code");

    await completeHandoff();

    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings?section=billing",
    );
    expect(
      screen.queryByRole("heading", { name: "Sign-in could not be completed" }),
    ).not.toBeInTheDocument();
  });

  it("opens the workspace when a session outlives the failed exchange", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    authState.exchangeCodeForSession.mockResolvedValue({
      status: "failed",
      error: new Error("code already spent"),
    });
    authState.set({ user: { id: "user-1" } });
    sessionStorage.setItem("zoption-social-auth-destination", "/app/settings?section=billing");
    renderCallback("/auth/callback?code=raced-code");

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings?section=billing",
    );
    expect(
      screen.queryByRole("heading", { name: "Sign-in could not be completed" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the failure behind when the session lands after it was reported", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    authState.exchangeCodeForSession.mockResolvedValue({
      status: "failed",
      error: new Error("code already spent"),
    });
    renderCallback("/auth/callback?code=raced-code");

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeInTheDocument();

    act(() => authState.set({ user: { id: "user-1" } }));

    expect(screen.getByTestId("current-location")).toHaveTextContent("/app");
    expect(
      screen.queryByRole("heading", { name: "Sign-in could not be completed" }),
    ).not.toBeInTheDocument();
  });

  it("holds the failure back while the session restore is still settling", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    authState.exchangeCodeForSession.mockResolvedValue({
      status: "failed",
      error: new Error("code already spent"),
    });
    authState.set({ loading: true });
    renderCallback("/auth/callback?code=raced-code");

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Completing secure sign-in")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Sign-in could not be completed" }),
    ).not.toBeInTheDocument();
  });

  it("opens the workspace when the code is already gone and the session is live", () => {
    // Every exchange leaves a code-stripped URL behind, so this is what a reload or a
    // restored tab boots into after a sign-in that worked.
    authState.set({ user: { id: "user-1" } });
    renderCallback("/auth/callback");

    expect(authState.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("current-location")).toHaveTextContent("/app");
  });

  it("reports the dead end when the code is gone and no session exists", () => {
    renderCallback("/auth/callback");

    expect(
      screen.getByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("keeps an unusable reset link unusable even when a session is live", () => {
    authState.set({ user: { id: "user-1" } });
    renderCallback("/auth/callback?next=%2Fupdate-password");

    expect(screen.getByRole("heading", { name: "Request a new reset link" })).toBeInTheDocument();
  });

  it("keeps the unusable-link report for a spent reset code even when a session is live", async () => {
    authState.exchangeCodeForSession.mockResolvedValue({ status: "already_signed_in" });
    renderCallback("/auth/callback?code=spent-code&next=%2Fupdate-password");

    await completeHandoff();

    expect(screen.getByRole("heading", { name: "Request a new reset link" })).toBeInTheDocument();
  });

  it("drops the single-use code from the address bar before the handoff ends", () => {
    // MemoryRouter does not own the browser URL, so seed it to prove what the
    // callback leaves behind for a reload or a restored tab.
    window.history.replaceState({}, "", "/auth/callback?code=secret-code&next=%2Fapp%2Fsettings");
    renderCallback("/auth/callback?code=secret-code&next=%2Fapp%2Fsettings");

    expect(window.location.pathname).toBe("/auth/callback");
    expect(window.location.search).not.toContain("secret-code");
    expect(window.location.search).toContain("next=%2Fapp%2Fsettings");
  });

  it("handles provider-declared callback errors", () => {
    renderCallback(
      "/auth/callback?error=access_denied&error_description=Link%20expired&next=%2Fupdate-password",
    );

    expect(screen.getByRole("heading", { name: "Request a new reset link" })).toBeInTheDocument();
    expect(authState.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("offers a retry without exposing social-provider callback details", () => {
    renderCallback(
      "/auth/callback?error=access_denied&error_description=Private%20provider%20detail",
    );

    expect(
      screen.getByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText(/Private provider detail/i)).not.toBeInTheDocument();
  });
});
