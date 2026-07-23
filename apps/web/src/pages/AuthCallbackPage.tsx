import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export function AuthCallbackPage() {
  const { exchangeCodeForSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const providerError = searchParams.get("error_description") ?? searchParams.get("error");
    const code = searchParams.get("code");
    if (providerError) {
      setError(providerError);
      return;
    }
    if (!code) {
      setError("This sign-in link is missing its authorization code. Request a new link and try again.");
      return;
    }

    void exchangeCodeForSession(code)
      .then(() => navigate(safeNext(searchParams.get("next")), { replace: true }))
      .catch((callbackError: unknown) => {
        setError(
          callbackError instanceof Error ? callbackError.message : "The sign-in link could not be completed.",
        );
      });
  }, [exchangeCodeForSession, navigate, searchParams]);

  if (error) {
    return (
      <div className="full-page-status error-state">
        <strong>We could not finish signing you in.</strong>
        <span>{error}</span>
        <Link className="button primary" to="/login">
          Return to sign in
        </Link>
      </div>
    );
  }

  return <div className="full-page-status">Securing your Zoption session…</div>;
}
