import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
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

export function AuthCallbackPage() {
  const { exchangeCodeForSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState(false);
  const recoveryRequested = searchParams.get("next") === "/update-password";

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const providerError = searchParams.get("error_description") ?? searchParams.get("error");
    const code = searchParams.get("code");
    if (providerError || !code) {
      consumeSocialAuthDestination();
      setError(true);
      return;
    }

    const requestedDestination = searchParams.get("next") ?? consumeSocialAuthDestination();
    let cancelled = false;
    const hold = new Promise((resolve) => window.setTimeout(resolve, SIGN_IN_HANDOFF_MS));

    void Promise.all([exchangeCodeForSession(code), hold])
      .then(([isPasswordRecovery]) => {
        if (cancelled) return;
        const destination = isPasswordRecovery
          ? "/update-password"
          : safeNext(requestedDestination);
        void navigate(destination, { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [exchangeCodeForSession, navigate, searchParams]);

  if (error) {
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
