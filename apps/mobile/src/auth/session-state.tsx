import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
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

import { clearAppLock } from "./app-lock";
import { parseOAuthCallbackUrl } from "./oauth-callback";
import { clearPlanCache } from "./plan-state";
import { assertSignOutRiskAllowed } from "./sign-out-policy";
import { getSupabaseClient, readStoredSessionSubject, supabase } from "./supabase-client";

import { DUMMY_DEV_SUBJECT } from "@/db/demo-seed";
export { DUMMY_DEV_SUBJECT };
export const DUMMY_DEV_STORAGE_KEY = "zoption.dev.dummy_session";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export interface SessionSnapshot {
  status: SessionStatus;
  subject: string | null;
}

export interface SessionContextValue extends SessionSnapshot {
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
  /**
   * Keep the encrypted workspace on the device. Set only by the forced
   * sign-out paths where the Worker already rejected the credential (expired
   * 401, deleted 410, identity mismatch) and the local copy is preserved for
   * recovery. A user-initiated sign-out never sets it.
   */
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
  const isDummySessionRef = useRef(false);
  const initializedRef = useRef(false);

  const applySubject = useCallback((nextSubject: string | null) => {
    isDummySessionRef.current = false;
    if (nextSubject) {
      void SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
    }
    const previousSubject = subjectRef.current;
    if (initializedRef.current && previousSubject !== nextSubject) {
      clearUserScopedRuntimeState();
    }
    // Telemetry is never given the Supabase subject or email: identifying a
    // finance-app user to the vendor is both unnecessary and outside the
    // threat model. Only sign-out propagates, to drop whatever anonymous id
    // PostHog minted for this launch.
    if (!nextSubject && previousSubject) {
      void telemetry.reset();
    }
    subjectRef.current = nextSubject;
    initializedRef.current = true;
    setSnapshot({
      status: nextSubject ? "signed-in" : "signed-out",
      subject: nextSubject,
    });
  }, []);

  useEffect(() => {
    if (!demoEnabled) {
      void SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
    }
    if (!supabase) {
      if (!demoEnabled) {
        setSnapshot(signedOutSession);
        return;
      }
      let active = true;
      void SecureStore.getItemAsync(DUMMY_DEV_STORAGE_KEY)
        .then(async (storedSubject) => {
          if (!active) return;
          if (storedSubject && storedSubject !== DUMMY_DEV_SUBJECT) {
            await SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
            setSnapshot(signedOutSession);
            return;
          }
          if (storedSubject && storedSubject === DUMMY_DEV_SUBJECT) {
            subjectRef.current = storedSubject;
            isDummySessionRef.current = true;
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
    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      // The startup getSession() below owns the initial state. INITIAL_SESSION
      // reports null whenever the startup refresh fails, including offline.
      if (event === "INITIAL_SESSION") return;
      if (active) applySubject(session?.user.id ?? null);
    });

    void client.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (!error && data?.session) {
        applySubject(data.session.user.id);
        return;
      }
      if (error && isAuthRetryableFetchError(error)) {
        // Offline with an expired access token: auth-js could not refresh but
        // kept the stored refresh token, so the user is still signed in. Open
        // their local workspace; the Worker identity check still gates sync,
        // and a refresh Supabase later rejects emits SIGNED_OUT.
        const storedSubject = await readStoredSessionSubject().catch(() => null);
        if (!active) return;
        if (storedSubject) {
          applySubject(storedSubject);
          return;
        }
      }
      if (demoEnabled) {
        const stored = await SecureStore.getItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => null);
        if (!active) return;
        if (stored && stored !== DUMMY_DEV_SUBJECT) {
          await SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
          applySubject(null);
          return;
        }
        if (stored && stored === DUMMY_DEV_SUBJECT) {
          subjectRef.current = stored;
          isDummySessionRef.current = true;
          initializedRef.current = true;
          setSnapshot({
            status: "signed-in",
            subject: stored,
          });
          return;
        }
      }
      applySubject(null);
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
  }, [applySubject, demoEnabled]);

  const signInWithDummyAccount = useCallback(async () => {
    if (!demoEnabled) {
      throw new Error("Dummy account sign-in is available only in Zoption Dev.");
    }
    await SecureStore.setItemAsync(DUMMY_DEV_STORAGE_KEY, DUMMY_DEV_SUBJECT).catch(() => undefined);
    if (initializedRef.current && subjectRef.current !== DUMMY_DEV_SUBJECT) {
      clearUserScopedRuntimeState();
    }
    subjectRef.current = DUMMY_DEV_SUBJECT;
    isDummySessionRef.current = true;
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
        (normalizedEmail.startsWith("dummy") || normalizedEmail.startsWith("test@") || !supabase)
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

  const getAccessToken = useCallback(
    async (refresh: boolean) => {
      if (isDummySessionRef.current) {
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
    },
    [demoEnabled],
  );

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
            JSON.stringify({
              name: exchangeError.name,
              message: exchangeError.message,
              code: exchangeError.code,
            }),
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

    if (isDummySessionRef.current) {
      await SecureStore.deleteItemAsync(DUMMY_DEV_STORAGE_KEY).catch(() => undefined);
    } else if (supabase) {
      const client = getSupabaseClient();
      if (options.preserveLocalWorkspace) {
        // Forced sign-out: the Worker already rejected the credential, so
        // there is nothing left to revoke and the encrypted workspace stays
        // for recovery. This device alone is cleared.
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
      } else {
        // A user-initiated sign-out revokes the refresh token server-side
        // (auth-js's default global scope), so a copied refresh token stops
        // minting access tokens.
        const { error } = await client.auth.signOut({ scope: "global" });
        if (error) {
          // Revocation needs Supabase, and offline is normal on mobile. A user
          // who asked to sign out must never stay signed in here, so clear
          // this device as well. Revocation is best-effort in that case, and
          // the fallback is not surfaced as an error: the user's intent - no
          // longer being signed in - was carried out.
          const { error: localError } = await client.auth.signOut({ scope: "local" });
          if (localError) throw localError;
        }
      }
    }
    isDummySessionRef.current = false;
    clearUserScopedRuntimeState();
    // Supabase may already have emitted SIGNED_OUT while auth.signOut awaited.
    // Reset here only when that listener did not already clear PostHog.
    if (subjectRef.current === subject) void telemetry.reset();

    if (subject && !options.preserveLocalWorkspace) {
      await discardLocalWorkspace(subject);
      await clearAppLock(subject);
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
