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

import { getSupabaseClient, isSupabaseConfigured, supabase } from "../lib/supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateDisplayName: (displayName: string | null) => Promise<void>;
  requestEmailChange: (email: string) => Promise<void>;
  verifyCurrentPassword: (password: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  exchangeCodeForSession: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function callbackUrl(next?: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) throw error;
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
    if (error) throw error;
  }, []);

  const exchangeCodeForSession = useCallback(async (code: string) => {
    const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updateDisplayName,
      requestEmailChange,
      verifyCurrentPassword,
      updatePassword,
      exchangeCodeForSession,
    }),
    [
      exchangeCodeForSession,
      loading,
      requestEmailChange,
      sendPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
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
