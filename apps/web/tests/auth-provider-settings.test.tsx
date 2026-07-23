// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  const session = {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      email: "current@example.com",
      user_metadata: {},
    },
  };

  return {
    session,
    updateUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  };
});

vi.mock("../src/lib/supabase", () => {
  const client = {
    auth: {
      updateUser: supabaseMocks.updateUser,
      signInWithPassword: supabaseMocks.signInWithPassword,
      signOut: supabaseMocks.signOut,
      signUp: supabaseMocks.signUp,
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

function SettingsOperations() {
  const {
    user,
    updateDisplayName,
    requestEmailChange,
    verifyCurrentPassword,
    updatePassword,
  } = useAuth();

  if (!user) return <span>Loading</span>;

  return (
    <div>
      <button type="button" onClick={() => void updateDisplayName("Taylor")}>
        Update name
      </button>
      <button type="button" onClick={() => void requestEmailChange("next@example.com")}>
        Update email
      </button>
      <button type="button" onClick={() => void verifyCurrentPassword("current-password")}>
        Verify password
      </button>
      <button type="button" onClick={() => void updatePassword("new-password")}>
        Replace password
      </button>
    </div>
  );
}

describe("AuthProvider account settings operations", () => {
  beforeEach(() => {
    supabaseMocks.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.getSession.mockReset().mockResolvedValue({
      data: { session: supabaseMocks.session },
      error: null,
    });
    supabaseMocks.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("sends profile, email, verification, and password changes through Supabase Auth", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SettingsOperations />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole("button", { name: "Update name" });

    fireEvent.click(screen.getByRole("button", { name: "Update name" }));
    await waitFor(() =>
      expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
        data: { display_name: "Taylor" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Update email" }));
    await waitFor(() =>
      expect(supabaseMocks.updateUser).toHaveBeenCalledWith(
        { email: "next@example.com" },
        {
          emailRedirectTo:
            "http://localhost:3000/auth/callback?next=%2Fapp%2Fsettings%3FemailChange%3Dconfirmed",
        },
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify password" }));
    await waitFor(() =>
      expect(supabaseMocks.signInWithPassword).toHaveBeenCalledWith({
        email: "current@example.com",
        password: "current-password",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace password" }));
    await waitFor(() =>
      expect(supabaseMocks.updateUser).toHaveBeenCalledWith({ password: "new-password" }),
    );
  });
});
