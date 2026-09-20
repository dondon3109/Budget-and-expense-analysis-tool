import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth, type CodeExchangeOutcome } from "../auth/AuthProvider";
import { consumeSocialAuthDestination } from "../auth/socialAuthDestination";
import { AuthLayout } from "../components/auth/AuthLayout";
import { FullPageLoadingStatus } from "../components/layout/FullPageLoadingStatus";

/**
 * How long the sign-in handoff stays on screen once the provider has answered.
 *
 * The session is already restored when this elapses; it exists so the branded
 * loading surface is actually seen, and it is the only artificial delay in the
 * app. A failed exchange skips it entirely.
 */
export const SIGN_IN_HANDOFF_MS = 2000;

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

/**
 * Drop the single-use code from the address bar before exchanging it.
 *
 * The provider hands the code back in the URL and it is spent the moment the
 * exchange lands, but React Router only replaces that URL once the handoff hold
 * finishes. Leaving it there lets any later run of this page — a reload, a
 * restored tab, a second tab — replay a dead callback. `replaceState` keeps the
 * history entry and stays outside the router, so it cannot re-run this effect
 * through its own dependencies.
 */
function dropCodeFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code")) return;
  url.searchParams.delete("code");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** The failure page stays deliberately generic, so leave the reported cause in the console. */
function reportExchangeFailure(error: unknown): void {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  console.error("Sign-in code exchange failed.", code ?? error);
}

export function AuthCallbackPage() {
  const { exchangeCodeForSession, loading, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const mountedRef = useRef(true);
  const [error, setError] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const recoveryRequested = searchParams.get("next") === "/update-password";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const providerError = searchParams.get("error_description") ?? searchParams.get("error");
    const code = searchParams.get("code");
    const requestedDestination = searchParams.get("next") ?? consumeSocialAuthDestination();
    setDestination(requestedDestination);

    if (providerError || !code) {
      setError(true);
      return;
    }

    dropCodeFromUrl();

    const hold = new Promise((resolve) => window.setTimeout(resolve, SIGN_IN_HANDOFF_MS));

    void exchangeCodeForSession(code)
      .catch((unexpected: unknown): CodeExchangeOutcome => ({
        status: "failed",
        error: unexpected,
      }))
      .then(async (outcome) => {
        // Leaving the page is not the same as this effect re-running, and only leaving it
        // makes the outcome irrelevant. Dropping it on a re-run would strand the loading
        // surface with nothing left to finish the handoff.
        if (!mountedRef.current) return;

        if (outcome.status === "failed") {
          reportExchangeFailure(outcome.error);
          setError(true);
          return;
        }

        // Only a fresh exchange proves a reset link is usable, so a spent code
        // still reports an unusable link even when a session is live.
        if (outcome.status === "already_signed_in" && recoveryRequested) {
          setError(true);
          return;
        }

        // The hold only delays a sign-in that worked. A failure above reports at
        // once instead of holding the loading surface over a dead end.
        await hold;
        if (!mountedRef.current) return;
        const destination =
          outcome.status === "signed_in" && outcome.isPasswordRecovery
            ? "/update-password"
            : safeNext(requestedDestination);
        void navigate(destination, { replace: true });
      });
  }, [exchangeCodeForSession, navigate, recoveryRequested, searchParams]);

  // A failure is not final while a session is live. The single-use code can be spent
  // by a run that won the race to it, and the session then arrives after this page has
  // already given up; opening the workspace is the only honest ending for that. A reset
  // link stays strict, because only a fresh exchange proves the link is usable.
  if (error && !recoveryRequested && user) {
    return <Navigate to={safeNext(destination)} replace />;
  }

  // Wait for the session restore to settle before reporting a failure, so a session
  // this page does not know about yet cannot be turned into a dead end.
  if (error && (recoveryRequested || !loading)) {
    return (
      <AuthLayout
        eyebrow={recoveryRequested ? "Account recovery" : "Secure sign-in"}
        title={recoveryRequested ? "Request a new reset link" : "Sign-in could not be completed"}
        description={
          recoveryRequested
            ? "This password reset link is invalid, expired, or has already been used."
            : "The provider did not complete sign-in. Return and try again, or use email and password."
        }
        footer={recoveryRequested ? <Link to="/login">Return to sign in</Link> : undefined}
      >
        <div className="auth-form">
          <Link className="button primary" to={recoveryRequested ? "/forgot-password" : "/login"}>
            {recoveryRequested ? "Send a new reset link" : "Return to sign in"}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <FullPageLoadingStatus
      title="Completing secure sign-in"
      description="Handing over from your provider and opening your workspace."
      phase="session"
      progress={1}
    />
  );
}
