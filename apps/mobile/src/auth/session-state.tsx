import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
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
import { discardLocalWorkspace, inspectLocalWorkspaceForSignOut } from "@/db/workspace";
import { useAssistantVoiceOptionsStore } from "@/stores/assistant-voice-store";
import { useSheetStore } from "@/stores/sheet-store";

import { parseOAuthCallbackUrl } from "./oauth-callback";
import { clearPlanCache } from "./plan-state";
import { assertSignOutRiskAllowed } from "./sign-out-policy";
import { getSupabaseClient, supabase } from "./supabase-client";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export interface SessionSnapshot {
  status: SessionStatus;
  subject: string | null;
}

interface SessionContextValue extends SessionSnapshot {
  configured: boolean;
  getAccessToken: (refresh: boolean) => Promise<string>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  exchangeCodeForSession: (code: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: (options?: SignOutOptions) => Promise<void>;
}

export interface SignOutOptions {
  discardUnsyncedChanges?: boolean;
  preserveLocalWorkspace?: boolean;
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
  getAccessToken: unavailable,
  signInWithPassword: unavailable,
  signInWithGoogle: unavailable,
  sendPasswordReset: unavailable,
  exchangeCodeForSession: unavailable,
  updatePassword: unavailable,
  signOut: unavailable,
});

function recoveryCallbackUrl(): string {
  return Linking.createURL("/auth/callback", { queryParams: { next: "update-password" } });
}

export function clearUserScopedRuntimeState(): void {
  // Durable financial caches arrive in Milestone 3. Every identity transition
  // enters through this boundary so those repositories can be cleared here.
  useSheetStore.getState().close();
  useAssistantVoiceOptionsStore.getState().ensureSubject(null);
  clearPlanCache();
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

  const getAccessToken = useCallback(async (refresh: boolean) => {
    const result = refresh
      ? await getSupabaseClient().auth.refreshSession()
      : await getSupabaseClient().auth.getSession();
    if (result.error) throw result.error;
    const session = result.data.session;
    if (!session || !subjectRef.current || session.user.id !== subjectRef.current) {
      throw new Error("Your session expired. Sign in again to open your workspace.");
    }
    return session.access_token;
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

  const signInWithGoogle = useCallback(async () => {
    // Opens the system browser via expo-web-browser's auth session; when the
    // provider redirects to the app's callback scheme the session resolves
    // with the callback URL, and the PKCE code in it is exchanged here
    // (skipBrowserRedirect means supabase-js will not do this itself).
    // The /auth/callback route remains for browser-based links such as
    // password recovery. The redirect uses the variant's own scheme
    // (zoption-dev, zoption-preview or zoption) so the callback reaches the
    // app directly instead of the dev-client's proxy scheme.
    //
    // The session is ephemeral on purpose: on iOS 26 the cookie-sharing
    // SafariViewService variant was observed being invalidated seconds after
    // presentation, and an ephemeral session also keeps the sign-in browser
    // isolated from the user's personal Safari browsing.
    const configuredScheme = Constants.expoConfig?.scheme;
    const scheme = Array.isArray(configuredScheme)
      ? (configuredScheme[0] ?? "zoption")
      : (configuredScheme ?? "zoption");
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: scheme + "://auth/callback",
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Google sign-in could not start.");
    const result = await WebBrowser.openAuthSessionAsync(data.url, scheme + "://auth/callback", {
      preferEphemeralSession: true,
    });
    if (result.type !== "success" || !result.url) {
      // The user dismissed the browser sheet without signing in.
      return;
    }
    const callback = parseOAuthCallbackUrl(result.url);
    if (!callback) return;
    if ("error" in callback) throw new Error(callback.error);
    const { error: exchangeError } = await getSupabaseClient().auth.exchangeCodeForSession(
      callback.code,
    );
    if (exchangeError) {
      // On Android the router's deep-link callback route may exchange the
      // same code first; the server then reports an invalid flow state here.
      // A session existing afterwards means the sign-in actually succeeded.
      const { data: currentSession } = await getSupabaseClient().auth.getSession();
      if (!currentSession.session) throw exchangeError;
    }
  }, []);

  const signOut = useCallback(async (options: SignOutOptions = {}) => {
    const subject = subjectRef.current;
    if (subject && !options.preserveLocalWorkspace) {
      const risk = await inspectLocalWorkspaceForSignOut(subject);
      assertSignOutRiskAllowed(risk, options.discardUnsyncedChanges === true);
    }

    const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throw error;
    clearUserScopedRuntimeState();

    if (subject && !options.preserveLocalWorkspace) {
      await discardLocalWorkspace(subject);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...snapshot,
      configured: isSupabaseConfigured,
      getAccessToken,
      signInWithPassword,
      signInWithGoogle,
      sendPasswordReset,
      exchangeCodeForSession,
      updatePassword,
      signOut,
    }),
    [
      exchangeCodeForSession,
      getAccessToken,
      signInWithGoogle,
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
