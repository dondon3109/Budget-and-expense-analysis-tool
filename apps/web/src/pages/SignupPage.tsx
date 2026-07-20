import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";

export function SignupPage() {
  const { configured, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await signUp(email, password);
      if (result.confirmationRequired) setConfirmationSent(true);
      else void navigate("/app", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Your account could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Start your workspace"
      title="Create your Clarity account"
      description="Start with a private workspace that is ready for the transactions and budgets you choose to add."
      footer={
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      {confirmationSent ? (
        <div className="auth-success" role="status">
          <strong>Check your email</strong>
          <p>We sent a confirmation link to {email}. Open it to finish creating your workspace.</p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
            <small>Use at least 8 characters.</small>
          </label>
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
          <button className="button primary" type="submit" disabled={busy || !configured}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
