// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authStateChangeCallback: undefined as ((event: string, session: null) => void) | undefined,
}));

vi.mock("../src/lib/supabase", () => {
  const client = {
    auth: {
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      exchangeCodeForSession: supabaseMocks.exchangeCodeForSession,
      getSession: supabaseMocks.getSession,
      onAuthStateChange: supabaseMocks.onAuthStateChange,
    },
  };

  return {
    isSupabaseConfigured: true,
    supabase: client,
    getSupabaseClient: () => client,
  };
});

import { AuthProvider, useAuth } from "../src/auth/AuthProvider";

function RecoveryOperations() {
  const { exchangeCodeForSession, sendPasswordReset } = useAuth();

  return (
    <div>
      <button type="button" onClick={() => void sendPasswordReset("user@example.com")}>
        Send reset
      </button>
      <button
        type="button"
        onClick={() =>
          void exchangeCodeForSession("recovery-code").then((outcome) => {
            document.body.dataset.exchangeStatus = outcome.status;
            document.body.dataset.passwordRecovery = String(
              outcome.status === "signed_in" && outcome.isPasswordRecovery,
            );
          })
        }
      >
        Exchange code
      </button>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RecoveryOperations />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthProvider password recovery", () => {
  afterEach(cleanup);

  beforeEach(() => {
    supabaseMocks.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.exchangeCodeForSession.mockReset().mockImplementation(async () => {
      supabaseMocks.authStateChangeCallback?.("PASSWORD_RECOVERY", null);
      return { data: { user: null, session: null }, error: null };
    });
    supabaseMocks.getSession.mockReset().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabaseMocks.authStateChangeCallback = undefined;
    supabaseMocks.onAuthStateChange
      .mockReset()
      .mockImplementation((callback: (event: string, session: null) => void) => {
        supabaseMocks.authStateChangeCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });
    delete document.body.dataset.passwordRecovery;
    delete document.body.dataset.exchangeStatus;
  });

  it("sends reset emails back through the update-password callback", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Send reset" }));

    await waitFor(() =>
      expect(supabaseMocks.resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
        redirectTo: "http://localhost:3000/auth/callback?next=%2Fupdate-password",
      }),
    );
  });

  it("detects Supabase's password recovery event while exchanging the code", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));

    await waitFor(() =>
      expect(supabaseMocks.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code"),
    );
    await waitFor(() => expect(document.body.dataset.passwordRecovery).toBe("true"));
  });
});

describe("AuthProvider callback code exchange", () => {
  afterEach(cleanup);

  beforeEach(() => {
    supabaseMocks.getSession.mockReset().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabaseMocks.exchangeCodeForSession.mockReset().mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "pkce_code_verifier_not_found" },
    });
    supabaseMocks.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    delete document.body.dataset.exchangeStatus;
  });

  it("reports an already signed-in outcome when a spent code still has a live session", async () => {
    supabaseMocks.getSession.mockResolvedValue({
      data: {
        session: { access_token: "token", user: { id: "user-1", user_metadata: {} } },
      },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));

    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("already_signed_in"));
  });

  it("keeps reporting a failed exchange when no session survived it", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));

    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("failed"));
  });

  it("answers a repeated exchange of the same code from the first attempt", async () => {
    // The signed-in subtree remounts on an identity change, so the callback can ask twice
    // for one single-use code. A second request would fail and misreport the link.
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));
    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("signed_in"));

    delete document.body.dataset.exchangeStatus;
    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));
    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("signed_in"));

    expect(supabaseMocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it("treats a rejected exchange like a spent code when a session survived it", async () => {
    // The SDK saves the session before it notifies subscribers and re-throws a
    // failure from that notification, so a rejection can still mean "signed in".
    supabaseMocks.exchangeCodeForSession.mockRejectedValue(new Error("auth notification failed"));
    supabaseMocks.getSession.mockResolvedValue({
      data: {
        session: { access_token: "token", user: { id: "user-1", user_metadata: {} } },
      },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));

    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("already_signed_in"));
  });

  it("keeps reporting a failure when a rejected exchange left no session", async () => {
    supabaseMocks.exchangeCodeForSession.mockRejectedValue(new Error("storage unavailable"));
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));

    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("failed"));
  });

  it("keeps reporting a failure when the session cannot be read after the exchange", async () => {
    supabaseMocks.getSession.mockRejectedValue(new Error("storage unavailable"));
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Exchange code" }));

    await waitFor(() => expect(document.body.dataset.exchangeStatus).toBe("failed"));
  });
});
