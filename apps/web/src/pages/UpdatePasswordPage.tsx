import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordField } from "../components/auth/PasswordField";
import { PasswordGuidance } from "../components/auth/PasswordGuidance";
import { evaluatePassword } from "../auth/passwordPolicy";
import { useAuth } from "../auth/AuthProvider";

export function UpdatePasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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
    if (!passwordEvaluation.isValid || password !== confirmation) {
      setPasswordTouched(true);
      setConfirmationTouched(true);
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      void navigate("/app", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Your password could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  const passwordDescribedBy = [
    "update-password-guidance",
    showPasswordError ? "update-password-error" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use a strong password you have not used for this account before."
    >
      <form
        className="auth-form"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        aria-busy={busy}
      >
        <PasswordField
          id="update-password"
          label="New password"
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
          disabled={busy}
          required
        />
        <PasswordGuidance
          password={password}
          id="update-password-guidance"
          errorId="update-password-error"
          showError={showPasswordError}
        />
        <PasswordField
          id="update-password-confirmation"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            setConfirmationTouched(true);
            setError(undefined);
          }}
          onBlur={() => setConfirmationTouched(true)}
          aria-describedby={confirmationError ? "update-password-confirmation-error" : undefined}
          aria-invalid={Boolean(confirmationError)}
          disabled={busy}
          required
        />
        {confirmationError && (
          <small id="update-password-confirmation-error" className="field-error">
            {confirmationError}
          </small>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Updating password…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
}
