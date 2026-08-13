import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import type { SocialAuthProvider } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordField } from "../components/auth/PasswordField";
import { SocialAuthButtons } from "../components/auth/SocialAuthButtons";
function safeRedirect(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app?proCheckout=open";
}

export function LoginPage() {
  const { configured, signIn, signInWithSocial } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<SocialAuthProvider | null>(null);
  const [error, setError] = useState<string>();
  const authenticationBusy = busy || busyProvider !== null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email, password);
      void navigate(safeRedirect(searchParams.get("redirectTo")), { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Sign in could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSocialSignIn(provider: SocialAuthProvider) {
    setBusyProvider(provider);
    setError(undefined);
    try {
      await signInWithSocial(provider, safeRedirect(searchParams.get("redirectTo")));
    } catch {
      setError("Google sign-in could not be started. Check your connection and try again.");
      setBusyProvider(null);
    }
  }
  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to Zoption"
      description="Continue to your personal budget and transaction workspace."
      footer={
        <p>
          New to Zoption? <Link to="/signup">Create an account</Link>
        </p>
      }
    >
      <SocialAuthButtons
        busyProvider={busyProvider}
        disabled={authenticationBusy || !configured}
        onSelect={(provider) => void handleSocialSignIn(provider)}
      />
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} aria-busy={busy}>
        <label>
          <span>Email address</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={authenticationBusy}
            required
          />
        </label>
        <PasswordField
          id="login-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={authenticationBusy}
          minLength={8}
          required
        />
        <div className="auth-form-meta">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        {!configured && (
          <p className="form-error" role="alert">
            Authentication is not configured for this environment.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          type="submit"
          disabled={authenticationBusy || !configured}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
