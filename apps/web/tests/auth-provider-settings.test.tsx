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
    upload: vi.fn(),
    remove: vi.fn(),
    getPublicUrl: vi.fn(),
    storageFrom: vi.fn(),
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
    storage: {
      from: supabaseMocks.storageFrom,
    },
  };

  return {
    isSupabaseConfigured: true,
    supabase: client,
    getSupabaseClient: () => client,
  };
});

vi.mock("../src/lib/api", () => ({
  deleteCurrentAccount: vi.fn(async () => ({ status: "deleted" })),
}));

import { deleteCurrentAccount } from "../src/lib/api";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";

function SettingsOperations() {
  const {
    user,
    updateDisplayName,
    updateAvatar,
    removeAvatar,
    requestEmailChange,
    verifyCurrentPassword,
    updatePassword,
    deleteAccount,
  } = useAuth();

  if (!user) return <span>Loading</span>;

  return (
    <div>
      <button type="button" onClick={() => void updateDisplayName("Taylor")}>
        Update name
      </button>
      <button
        type="button"
        onClick={() => void updateAvatar(new File(["avatar"], "avatar.png", { type: "image/png" }))}
      >
        Update avatar
      </button>
      <button type="button" onClick={() => void removeAvatar()}>
        Remove avatar
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
      <button type="button" onClick={() => void deleteAccount("current-password")}>
        Delete account
      </button>
    </div>
  );
}

describe("AuthProvider account settings operations", () => {
  beforeEach(() => {
    supabaseMocks.session.user.user_metadata = {};
    vi.mocked(deleteCurrentAccount).mockReset().mockResolvedValue({ status: "deleted" });
    supabaseMocks.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.upload.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.remove.mockReset().mockResolvedValue({ data: {}, error: null });
    supabaseMocks.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: "avatar-url" } });
    supabaseMocks.storageFrom.mockReset().mockReturnValue({
      upload: supabaseMocks.upload,
      remove: supabaseMocks.remove,
      getPublicUrl: supabaseMocks.getPublicUrl,
    });
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

    fireEvent.click(screen.getByRole("button", { name: "Update avatar" }));
    await waitFor(() => expect(supabaseMocks.upload).toHaveBeenCalledTimes(1));
    const avatarPath = supabaseMocks.upload.mock.calls[0]?.[0] as string;
    expect(avatarPath).toMatch(/^user-1\/[a-f0-9-]+\.png$/);
    expect(supabaseMocks.storageFrom).toHaveBeenCalledWith("avatars");
    expect(supabaseMocks.upload).toHaveBeenCalledWith(
      avatarPath,
      expect.any(File),
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: { avatar_path: avatarPath },
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove avatar" }));
    await waitFor(() =>
      expect(supabaseMocks.updateUser).toHaveBeenCalledWith({ data: { avatar_path: null } }),
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

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() =>
      expect(deleteCurrentAccount).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        "current-password",
      ),
    );
    expect(supabaseMocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
