import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { normalizePasswordError, normalizeSignupError } from "./authErrors";
import { saveSocialAuthDestination } from "./socialAuthDestination";
import {
  AVATAR_BUCKET,
  type AvatarOperationResult,
  avatarPathFromMetadata,
  createAvatarPath,
  isOwnedAvatarPath,
  validateAvatarFile,
} from "../lib/avatar";
import { deleteCurrentAccount } from "../lib/api";
import { getSupabaseClient, isSupabaseConfigured, supabase } from "../lib/supabase";
import { userWorkspace } from "../lib/workspace";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithSocial: (provider: SocialAuthProvider, next?: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateDisplayName: (displayName: string | null) => Promise<void>;
  updateAvatar: (file: File) => Promise<AvatarOperationResult>;
  removeAvatar: () => Promise<AvatarOperationResult>;
  requestEmailChange: (email: string) => Promise<void>;
  verifyCurrentPassword: (password: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<{ status: "deleted" | "cleanup_pending" }>;
  exchangeCodeForSession: (code: string) => Promise<boolean>;
}

export type SocialAuthProvider = "google" | "facebook";

const AuthContext = createContext<AuthContextValue | null>(null);

function callbackUrl(next?: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  if (next?.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
  return url.toString();
}

const SOCIAL_SCOPES: Record<SocialAuthProvider, string> = {
  google: "openid email profile",
  facebook: "email public_profile",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const passwordRecoveryRef = useRef(false);

  const applySession = useCallback(
    (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      const previousUserId = userIdRef.current;
      const identityChanged = initializedRef.current && previousUserId !== nextUserId;

      if (identityChanged) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }

      userIdRef.current = nextUserId;
      initializedRef.current = true;
      setSession(nextSession);
      setLoading(false);
    },
    [queryClient],
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") passwordRecoveryRef.current = true;
      if (active) applySession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        applySession(null);
        return;
      }
      applySession(data.session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signInWithSocial = useCallback(async (provider: SocialAuthProvider, next?: string) => {
    // Supabase owns email uniqueness and automatically links a verified OAuth
    // identity to an existing user with the same email. Keeping this as a
    // normal OAuth sign-in preserves the existing user ID and D1 workspace.
    saveSocialAuthDestination(next);
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
      provider,
      options: {
        // Keep this URL exact so it matches Supabase's production redirect allow-list.
        // The safe in-app destination is kept in this tab instead of changing the callback URL.
        redirectTo: callbackUrl(),
        scopes: SOCIAL_SCOPES[provider],
      },
    });
    if (error) {
      saveSocialAuthDestination(null);
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    // Let Supabase's server-side create operation own email uniqueness and race handling.
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      const normalizedError = normalizeSignupError(error);
      if (normalizedError.code === "duplicate_email") return { confirmationRequired: true };
      throw normalizedError;
    }

    // With email confirmation enabled, Supabase masks an existing email as a
    // successful signup response whose user has no identities. Keep that case
    // indistinguishable from a new account awaiting confirmation.
    if (data.user && data.user.identities?.length === 0) {
      return { confirmationRequired: true };
    }

    return { confirmationRequired: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl("/update-password"),
    });
    if (error) throw error;
  }, []);

  const updateDisplayName = useCallback(async (displayName: string | null) => {
    const { error } = await getSupabaseClient().auth.updateUser({
      data: { display_name: displayName },
    });
    if (error) throw error;
  }, []);

  const updateAvatar = useCallback(
    async (file: File): Promise<AvatarOperationResult> => {
      const user = session?.user;
      if (!user) throw new Error("Sign in again before updating your profile picture.");

      await validateAvatarFile(file);
      const client = getSupabaseClient();
      const bucket = client.storage.from(AVATAR_BUCKET);
      const previousPath = avatarPathFromMetadata(user.user_metadata);
      const nextPath = createAvatarPath(user.id, file.type);
      const { error: uploadError } = await bucket.upload(nextPath, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: metadataError } = await client.auth.updateUser({
        data: { avatar_path: nextPath },
      });
      if (metadataError) {
        await bucket.remove([nextPath]);
        throw metadataError;
      }

      if (isOwnedAvatarPath(previousPath, user.id)) {
        const { error: cleanupError } = await bucket.remove([previousPath]);
        if (cleanupError) {
          return {
            cleanupWarning:
              "Your new picture is active, but the previous file could not be cleaned up.",
          };
        }
      }

      return {};
    },
    [session?.user],
  );

  const removeAvatar = useCallback(async (): Promise<AvatarOperationResult> => {
    const user = session?.user;
    if (!user) throw new Error("Sign in again before removing your profile picture.");

    const previousPath = avatarPathFromMetadata(user.user_metadata);
    const client = getSupabaseClient();
    const { error: metadataError } = await client.auth.updateUser({
      data: { avatar_path: null },
    });
    if (metadataError) throw metadataError;

    if (isOwnedAvatarPath(previousPath, user.id)) {
      const { error: cleanupError } = await client.storage
        .from(AVATAR_BUCKET)
        .remove([previousPath]);
      if (cleanupError) {
        return {
          cleanupWarning:
            "Your picture was removed from the profile, but its old file could not be cleaned up.",
        };
      }
    }

    return {};
  }, [session?.user]);

  const requestEmailChange = useCallback(async (email: string) => {
    const { error } = await getSupabaseClient().auth.updateUser(
      { email },
      { emailRedirectTo: callbackUrl("/app/settings?emailChange=confirmed") },
    );
    if (error) throw error;
  }, []);

  const verifyCurrentPassword = useCallback(
    async (password: string) => {
      const email = session?.user.email;
      if (!email) throw new Error("Password verification is unavailable for this account.");

      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [session?.user.email],
  );

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw normalizePasswordError(error);
  }, []);

  const deleteAccount = useCallback(
    async (password: string) => {
      const user = session?.user;
      if (!user) throw new Error("Sign in again before deleting your account.");

      const result = await deleteCurrentAccount(userWorkspace(user), password);
      await queryClient.cancelQueries();
      queryClient.clear();
      try {
        await getSupabaseClient().auth.signOut({ scope: "local" });
      } catch {
        // The local session may already be gone after Auth hard deletion.
      }
      return result;
    },
    [queryClient, session?.user],
  );

  const exchangeCodeForSession = useCallback(async (code: string) => {
    passwordRecoveryRef.current = false;
    const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    if (error) {
      passwordRecoveryRef.current = false;
      throw error;
    }
    const isPasswordRecovery = passwordRecoveryRef.current;
    passwordRecoveryRef.current = false;
    return isPasswordRecovery;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signInWithSocial,
      signUp,
      signOut,
      sendPasswordReset,
      updateDisplayName,
      updateAvatar,
      removeAvatar,
      requestEmailChange,
      verifyCurrentPassword,
      updatePassword,
      deleteAccount,
      exchangeCodeForSession,
    }),
    [
      deleteAccount,
      exchangeCodeForSession,
      loading,
      removeAvatar,
      requestEmailChange,
      sendPasswordReset,
      session,
      signIn,
      signInWithSocial,
      signOut,
      signUp,
      updateAvatar,
      updateDisplayName,
      updatePassword,
      verifyCurrentPassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
