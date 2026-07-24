// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => {
  const client = {
    auth: {
      signUp: supabaseMocks.signUp,
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

function SignupOperation() {
  const { signUp } = useAuth();

  return (
    <button
      type="button"
      onClick={() =>
        void signUp("trimmed@example.com", "Budgeting-2026!").catch((error: unknown) => {
          const authError = error as { code?: string; message?: string };
          document.body.dataset.error = `${authError.code}:${authError.message}`;
        })
      }
    >
      Create account
    </button>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SignupOperation />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthProvider signup", () => {
  afterEach(cleanup);

  beforeEach(() => {
    supabaseMocks.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    supabaseMocks.getSession
      .mockReset()
      .mockResolvedValue({ data: { session: null }, error: null });
    supabaseMocks.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    delete document.body.dataset.error;
  });

  it("uses Supabase's server-side signup operation and callback URL", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(supabaseMocks.signUp).toHaveBeenCalledWith({
        email: "trimmed@example.com",
        password: "Budgeting-2026!",
        options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
      }),
    );
  });

  it("reports confirmation-required and immediate-session responses", async () => {
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(supabaseMocks.signUp).toHaveBeenCalledTimes(1));

    supabaseMocks.signUp.mockResolvedValueOnce({
      data: { session: { access_token: "token" } },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(supabaseMocks.signUp).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["email_exists", "duplicate_email"],
    ["user_already_exists", "duplicate_email"],
    ["weak_password", "weak_password"],
    ["over_request_rate_limit", "rate_limited"],
    ["over_email_send_rate_limit", "rate_limited"],
    ["unexpected_failure", "unknown"],
  ] as const)("normalizes Supabase %s as %s", async (providerCode, appCode) => {
    supabaseMocks.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: providerCode, message: "provider detail" },
    });
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(document.body.dataset.error).toContain(`${appCode}:`));
    expect(document.body.dataset.error).not.toContain("provider detail");
  });

  it("detects Supabase's masked existing-email response", async () => {
    supabaseMocks.signUp.mockResolvedValueOnce({
      data: { session: null, user: { identities: [] } },
      error: null,
    });
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(document.body.dataset.error).toBe("duplicate_email:This email is already registered."),
    );
  });
});
