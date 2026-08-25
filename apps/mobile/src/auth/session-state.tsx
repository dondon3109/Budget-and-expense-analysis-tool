import * as SecureStore from "expo-secure-store";
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
import { isDevelopmentAppVariant } from "@/config/app-variant";
import { discardLocalWorkspace, inspectLocalWorkspaceForSignOut } from "@/db/workspace";
import { useAssistantVoiceOptionsStore } from "@/stores/assistant-voice-store";
import { useSheetStore } from "@/stores/sheet-store";
import { telemetry } from "@/telemetry/telemetry";

import { parseOAuthCallbackUrl } from "./oauth-callback";
import { clearPlanCache } from "./plan-state";
import { assertSignOutRiskAllowed } from "./sign-out-policy";
import { getSupabaseClient, supabase } from "./supabase-client";

import { DUMMY_DEV_SUBJECT } from "@/db/demo-seed";
export { DUMMY_DEV_SUBJECT };
export const DUMMY_DEV_STORAGE_KEY = "zoption.dev.dummy_session";

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
  signInWithDummyAccount: () => Promise<void>;
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
  signInWithDummyAccount: unavailable,
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
  const demoEnabled = isDevelopmentAppVariant();
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({ status: "loading", subject: null });
  const subjectRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const applySession = useCallback((session: Session | null) => {
    const nextSubject = session?.user.id ?? null;
    const previousSubject = subjectRef.current;
    if (initializedRef.current && previousSubject !== nextSubject) {
      clearUserScopedRuntimeState();
    }
    if (nextSubject && previousSubject !== nextSubject) {
      // Supabase user.id is a stable authenticated primary key. Email remains
      // a person property and is never attached to crash-event properties.
      void telemetry.identify(nextSubject, { email: session?.user.email });
    } else if (!nextSubject && previousSubject) {
      void telemetry.reset();
    }
    subjectRef.current = nextSubject;
    initializedRef.current = true;
    setSnapshot({
      status: session ? "signed-in" : "signed-out",
      subject: nextSubject,
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      if (!demoEnabled) {
        void SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
        setSnapshot(signedOutSession);
        return;
      }
      let active = true;
      void SecureStore.getItemAsync(DUMMY_DEV_STORAGE_KEY)
        .then((storedSubject) => {
          if (!active) return;
          if (storedSubject) {
            void telemetry.identify(storedSubject);
            subjectRef.current = storedSubject;
            initializedRef.current = true;
            setSnapshot({
              status: "signed-in",
              subject: storedSubject,
            });
          } else {
            setSnapshot(signedOutSession);
          }
        })
        .catch(() => {
          if (active) setSnapshot(signedOutSession);
        });
      return () => {
        active = false;
      };
    }
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
  }, [applySession, demoEnabled]);

  const signInWithDummyAccount = useCallback(async () => {
    if (!demoEnabled) {
      throw new Error("Dummy account sign-in is available only in Zoption Dev.");
    }
    await SecureStore.setItemAsync(DUMMY_DEV_STORAGE_KEY, DUMMY_DEV_SUBJECT).catch(() => undefined);
    if (initializedRef.current && subjectRef.current !== DUMMY_DEV_SUBJECT) {
      clearUserScopedRuntimeState();
    }
    void telemetry.identify(DUMMY_DEV_SUBJECT);
    subjectRef.current = DUMMY_DEV_SUBJECT;
    initializedRef.current = true;
    setSnapshot({
      status: "signed-in",
      subject: DUMMY_DEV_SUBJECT,
    });
  }, [demoEnabled]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      if (
        demoEnabled &&
        (normalizedEmail.startsWith("dummy") ||
          normalizedEmail.startsWith("test@") ||
          !supabase)
      ) {
        await signInWithDummyAccount();
        return;
      }
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },
    [demoEnabled, signInWithDummyAccount],
  );

  const getAccessToken = useCallback(async (refresh: boolean) => {
    if (subjectRef.current === DUMMY_DEV_SUBJECT) {
      if (!demoEnabled) {
        throw new Error("Dummy sessions are not available in this Zoption build.");
      }
      return "dummy-dev-access-token";
    }
    const result = refresh
      ? await getSupabaseClient().auth.refreshSession()
      : await getSupabaseClient().auth.getSession();
    if (result.error) throw result.error;
    const session = result.data.session;
    if (!session || !subjectRef.current || session.user.id !== subjectRef.current) {
      throw new Error("Your session expired. Sign in again to open your workspace.");
    }
    return session.access_token;
  }, [demoEnabled]);

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
    const authorizeUrl = new URL(data.url);
    authorizeUrl.searchParams.set("skip_http_redirect", "true");
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl.toString(),
      scheme + "://auth/callback",
      {
        preferEphemeralSession: true,
      },
    );
    if (result.type !== "success") {
      throw new Error("Google sign-in was not completed (browser result: " + result.type + ").");
    }
    if (!result.url) {
      throw new Error("Google sign-in returned no callback URL.");
    }
    const callback = parseOAuthCallbackUrl(result.url);
    if (!callback) {
      throw new Error("Google callback URL could not be parsed: " + result.url.slice(0, 200));
    }
    if ("error" in callback) throw new Error(callback.error);
    const { error: exchangeError } = await getSupabaseClient().auth.exchangeCodeForSession(
      callback.code,
    );
    if (exchangeError) {
      const { data: currentSession } = await getSupabaseClient().auth.getSession();
      if (!currentSession.session) {
        throw new Error(
          "Google code exchange failed: " +
            JSON.stringify({ name: exchangeError.name, message: exchangeError.message, code: exchangeError.code }),
        );
      }
    }
  }, []);

  const signOut = useCallback(async (options: SignOutOptions = {}) => {
    const subject = subjectRef.current;
    if (subject && !options.preserveLocalWorkspace) {
      const risk = await inspectLocalWorkspaceForSignOut(subject);
      assertSignOutRiskAllowed(risk, options.discardUnsyncedChanges === true);
    }

    if (subject === DUMMY_DEV_SUBJECT) {
      await SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
    } else if (supabase) {
      const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
      if (error) throw error;
    }
    clearUserScopedRuntimeState();
    // Supabase may already have emitted SIGNED_OUT while auth.signOut awaited.
    // Reset here only when that listener did not already clear PostHog.
    if (subjectRef.current === subject) void telemetry.reset();

    if (subject && !options.preserveLocalWorkspace) {
      await discardLocalWorkspace(subject);
    }
    subjectRef.current = null;
    setSnapshot(signedOutSession);
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
      signInWithDummyAccount,
    }),
    [
      exchangeCodeForSession,
      getAccessToken,
      signInWithDummyAccount,
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
