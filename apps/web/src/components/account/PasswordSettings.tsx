import { useState, type FormEvent } from "react";

import { evaluatePassword } from "../../auth/passwordPolicy";
import { useAuth } from "../../auth/AuthProvider";
import { PasswordField } from "../auth/PasswordField";
import { PasswordGuidance } from "../auth/PasswordGuidance";

interface Feedback {
  error?: string;
  success?: string;
}

/** Changes the password, or creates one for an account that signs in only with a provider. */
export function PasswordSettings({ hasPasswordIdentity }: { hasPasswordIdentity: boolean }) {
  const { user, verifyCurrentPassword, updatePassword } = useAuth();
  const currentEmail = user?.email ?? "";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [newPasswordTouched, setNewPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>({});

  const newPasswordEvaluation = evaluatePassword(newPassword);
  const showNewPasswordError =
    (passwordSubmitted || newPasswordTouched) && !newPasswordEvaluation.isValid;
  const confirmPasswordError =
    (passwordSubmitted || confirmPasswordTouched) && !confirmPassword
      ? "Confirm your password."
      : (passwordSubmitted || confirmPasswordTouched) && newPassword !== confirmPassword
        ? "Passwords do not match."
        : undefined;

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSubmitted(true);

    if (!newPasswordEvaluation.isValid) {
      setPasswordFeedback({ error: "New password must meet every requirement." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ error: "New password and confirmation do not match." });
      return;
    }
    if (hasPasswordIdentity && newPassword === currentPassword) {
      setPasswordFeedback({
        error: "Choose a new password that differs from your current password.",
      });
      return;
    }

    setPasswordBusy(true);
    setPasswordFeedback({});
    try {
      if (hasPasswordIdentity) {
        try {
          await verifyCurrentPassword(currentPassword);
        } catch {
          setPasswordFeedback({ error: "The current password could not be verified." });
          return;
        }
      }

      await updatePassword(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSubmitted(false);
      setNewPasswordTouched(false);
      setConfirmPasswordTouched(false);
      setPasswordFeedback({
        success: hasPasswordIdentity
          ? "Password updated. Use the new password the next time you sign in."
          : "Password created. You can now sign in with email or your connected provider.",
      });
    } catch (error) {
      setPasswordFeedback({
        error: error instanceof Error ? error.message : "Your password could not be updated.",
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  function clearPasswordFeedback() {
    if (passwordFeedback.error || passwordFeedback.success) setPasswordFeedback({});
  }

  return (
    <section className="settings-section" aria-labelledby="password-settings-title">
      <div className="settings-section-heading">
        <div>
          <h2 id="password-settings-title">Password</h2>
          <p>
            {hasPasswordIdentity
              ? "Verify your current password before replacing it with a new one."
              : "Create a password to add email sign-in and unlock password-protected account actions."}
          </p>
        </div>
        <span>{hasPasswordIdentity ? "12+ characters and mixed character types" : "Optional"}</span>
      </div>

      <form
        className="settings-form"
        onSubmit={(event) => void handlePasswordSubmit(event)}
        aria-busy={passwordBusy}
      >
        {hasPasswordIdentity && (
          <PasswordField
            id="settings-current-password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              clearPasswordFeedback();
            }}
            disabled={passwordBusy || !currentEmail}
            required
          />
        )}
        <div className="settings-password-row">
          <PasswordField
            id="settings-new-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setNewPasswordTouched(true);
              clearPasswordFeedback();
            }}
            onBlur={() => setNewPasswordTouched(true)}
            aria-describedby={
              showNewPasswordError
                ? "settings-password-guidance settings-password-error"
                : "settings-password-guidance"
            }
            aria-invalid={showNewPasswordError}
            disabled={passwordBusy || !currentEmail}
            required
          />
          <PasswordField
            id="settings-confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmPasswordTouched(true);
              clearPasswordFeedback();
            }}
            onBlur={() => setConfirmPasswordTouched(true)}
            aria-describedby={confirmPasswordError ? "settings-confirm-password-error" : undefined}
            aria-invalid={Boolean(confirmPasswordError)}
            disabled={passwordBusy || !currentEmail}
            required
          />
        </div>
        <PasswordGuidance
          password={newPassword}
          id="settings-password-guidance"
          errorId="settings-password-error"
          showError={showNewPasswordError}
        />
        {confirmPasswordError && (
          <small id="settings-confirm-password-error" className="field-error">
            {confirmPasswordError}
          </small>
        )}
        {!currentEmail && (
          <p className="settings-helper">
            Password changes are unavailable because this account does not use an email login.
          </p>
        )}
        {passwordFeedback.error && (
          <p className="form-error" role="alert">
            {passwordFeedback.error}
          </p>
        )}
        {passwordFeedback.success && (
          <p className="form-success" role="status">
            {passwordFeedback.success}
          </p>
        )}
        <div className="settings-form-actions">
          <button
            className="button primary compact"
            type="submit"
            disabled={passwordBusy || !currentEmail}
          >
            {passwordBusy
              ? hasPasswordIdentity
                ? "Updating password…"
                : "Creating password…"
              : hasPasswordIdentity
                ? "Update password"
                : "Create password"}
          </button>
        </div>
      </form>
    </section>
  );
}
