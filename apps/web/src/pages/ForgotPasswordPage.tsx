import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";

export function ForgotPasswordPage() {
  const { configured, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "The reset email could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Reset your password"
      description="We’ll email you a secure link to choose a new password."
      footer={<Link to="/login">← Back to sign in</Link>}
    >
      {sent ? (
        <div className="auth-success" role="status">
          <strong>Check your email</strong>
          <p>If an account exists for {email}, a password reset link is on its way.</p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
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
            {busy ? "Sending link…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
