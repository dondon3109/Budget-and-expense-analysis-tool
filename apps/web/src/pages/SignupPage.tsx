import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthOperationError } from "../auth/authErrors";
import { evaluatePassword } from "../auth/passwordPolicy";
import { useAuth } from "../auth/AuthProvider";
import type { SocialAuthProvider } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordField } from "../components/auth/PasswordField";
import { PasswordGuidance } from "../components/auth/PasswordGuidance";
import { SocialAuthButtons } from "../components/auth/SocialAuthButtons";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupPage() {
  const { configured, signUp, signInWithSocial } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<SocialAuthProvider | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [error, setError] = useState<AuthOperationError>();
  const authenticationBusy = busy || busyProvider !== null;

  const passwordEvaluation = evaluatePassword(password);
  const showPasswordError = (submitted || passwordTouched) && !passwordEvaluation.isValid;
  const confirmationError =
    (submitted || confirmationTouched) && !confirmation
      ? "Confirm your password."
      : (submitted || confirmationTouched) && password !== confirmation
        ? "Passwords do not match."
        : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(undefined);
    setEmailError(undefined);

    const normalizedEmail = email.trim();
    let invalid = false;
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailError("Enter a valid email address.");
      invalid = true;
    }
    if (!passwordEvaluation.isValid || password !== confirmation) invalid = true;
    if (invalid) {
      setPasswordTouched(true);
      setConfirmationTouched(true);
      return;
    }

    setEmail(normalizedEmail);
    setBusy(true);
    try {
      const result = await signUp(normalizedEmail, password);
      if (result.confirmationRequired) setConfirmationSent(true);
      else void navigate("/app?proCheckout=open", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof AuthOperationError
          ? submitError
          : new AuthOperationError("unknown", "Your account could not be created."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSocialSignIn(provider: SocialAuthProvider) {
    setBusyProvider(provider);
    setError(undefined);
    try {
      await signInWithSocial(provider, "/app?proCheckout=open");
    } catch {
      setError(
        new AuthOperationError(
          "unknown",
          `${provider === "google" ? "Google" : "Facebook"} sign-in could not be started. Check your connection and try again.`,
        ),
      );
      setBusyProvider(null);
    }
  }

  const passwordDescribedBy = [
    "signup-password-guidance",
    showPasswordError ? "signup-password-error" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AuthLayout
      eyebrow="Start your workspace"
      title="Create your Zoption account"
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
          <p>
            If {email} is available for a new account, a confirmation link is on its way. Open it to
            finish creating your workspace.
          </p>
          <div className="auth-success-actions">
            <Link className="button secondary" to="/">
              Back to Home
            </Link>
          </div>
        </div>
      ) : (
        <>
          <SocialAuthButtons
            busyProvider={busyProvider}
            disabled={authenticationBusy || !configured}
            onSelect={(provider) => void handleSocialSignIn(provider)}
          />
          <form
            className="auth-form"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
            aria-busy={busy}
          >
            <label htmlFor="signup-email">
              <span>Email address</span>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(undefined);
                  setError(undefined);
                }}
                aria-describedby={emailError ? "signup-email-error" : undefined}
                aria-invalid={Boolean(emailError)}
                disabled={authenticationBusy}
                required
              />
            </label>
            {emailError && (
              <small id="signup-email-error" className="field-error">
                {emailError}
              </small>
            )}

            <PasswordField
              id="signup-password"
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordTouched(true);
                setError(undefined);
              }}
              onBlur={() => setPasswordTouched(true)}
              aria-describedby={passwordDescribedBy}
              aria-invalid={showPasswordError}
              disabled={authenticationBusy}
              required
            />
            <PasswordGuidance
              password={password}
              id="signup-password-guidance"
              errorId="signup-password-error"
              showError={showPasswordError}
            />

            <PasswordField
              id="signup-confirmation"
              label="Confirm password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setConfirmationTouched(true);
                setError(undefined);
              }}
              onBlur={() => setConfirmationTouched(true)}
              aria-describedby={confirmationError ? "signup-confirmation-error" : undefined}
              aria-invalid={Boolean(confirmationError)}
              disabled={authenticationBusy}
              required
            />
            {confirmationError && (
              <small id="signup-confirmation-error" className="field-error">
                {confirmationError}
              </small>
            )}

            {!configured && (
              <p className="form-error" role="alert">
                Authentication is not configured for this environment.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error.message}
              </p>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={authenticationBusy || !configured}
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
