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
          void exchangeCodeForSession("recovery-code").then((isPasswordRecovery) => {
            document.body.dataset.passwordRecovery = String(isPasswordRecovery);
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
