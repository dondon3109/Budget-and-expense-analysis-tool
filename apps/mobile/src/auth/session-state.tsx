import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";

import { isSupabaseConfigured } from "@/config/public-config";
import { useSheetStore } from "@/stores/sheet-store";

import { getSupabaseClient, supabase } from "./supabase-client";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export interface SessionSnapshot {
  status: SessionStatus;
  subject: string | null;
}

interface SessionContextValue extends SessionSnapshot {
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  exchangeCodeForSession: (code: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const signedOutSession: SessionSnapshot = { status: "signed-out", subject: null };

const unavailable = (): Promise<never> => {
  try {
    getSupabaseClient();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Authentication failed."));
  }
  return Promise.reject(new Error("Authentication is unavailable."));
};

const SessionContext = createContext<SessionContextValue>({
  ...signedOutSession,
  configured: false,
  signInWithPassword: unavailable,
  sendPasswordReset: unavailable,
  exchangeCodeForSession: unavailable,
  updatePassword: unavailable,
  signOut: unavailable,
});

function recoveryCallbackUrl(): string {
  return Linking.createURL("/auth/callback", { queryParams: { next: "update-password" } });
}

function clearUserScopedRuntimeState(): void {
  // Durable financial caches arrive in Milestone 3. Every identity transition
  // enters through this boundary so those repositories can be cleared here.
  useSheetStore.getState().close();
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    supabase ? { status: "loading", subject: null } : signedOutSession,
  );
  const subjectRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const applySession = useCallback((session: Session | null) => {
    const nextSubject = session?.user.id ?? null;
    if (initializedRef.current && subjectRef.current !== nextSubject) {
      clearUserScopedRuntimeState();
    }
    subjectRef.current = nextSubject;
    initializedRef.current = true;
    setSnapshot({
      status: session ? "signed-in" : "signed-out",
      subject: nextSubject,
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    let active = true;
    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      applySession(error ? null : data.session);
    });

    const appStateListener =
      Platform.OS === "web"
        ? null
        : AppState.addEventListener("change", (state) => {
            if (state === "active") void client.auth.startAutoRefresh();
            else void client.auth.stopAutoRefresh();
          });

    if (Platform.OS !== "web" && AppState.currentState === "active") {
      void client.auth.startAutoRefresh();
    }

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      appStateListener?.remove();
      if (Platform.OS !== "web") void client.auth.stopAutoRefresh();
    };
  }, [applySession]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: recoveryCallbackUrl(),
    });
    if (error) throw error;
  }, []);

  const exchangeCodeForSession = useCallback(async (code: string) => {
    const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throw error;
    clearUserScopedRuntimeState();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...snapshot,
      configured: isSupabaseConfigured,
      signInWithPassword,
      sendPasswordReset,
      exchangeCodeForSession,
      updatePassword,
      signOut,
    }),
    [
      exchangeCodeForSession,
      sendPasswordReset,
      signInWithPassword,
      signOut,
      snapshot,
      updatePassword,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionSnapshot(): SessionContextValue {
  return useContext(SessionContext);
}
