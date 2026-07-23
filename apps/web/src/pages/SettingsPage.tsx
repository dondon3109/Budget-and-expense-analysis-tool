import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";

const DISPLAY_NAME_LIMIT = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Feedback {
  error?: string;
  success?: string;
}

function displayNameFromMetadata(metadata: Record<string, unknown> | undefined): string {
  return typeof metadata?.display_name === "string" ? metadata.display_name : "";
}

export function SettingsPage() {
  const {
    user,
    updateDisplayName,
    requestEmailChange,
    verifyCurrentPassword,
    updatePassword,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const savedDisplayName = displayNameFromMetadata(user?.user_metadata);
  const currentEmail = user?.email ?? "";
  const pendingEmail = user?.new_email;

  const [displayName, setDisplayName] = useState(savedDisplayName);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileBusy, setProfileBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>({});
  const [emailFeedback, setEmailFeedback] = useState<Feedback>({});
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>({});

  const normalizedDisplayName = displayName.trim();
  const displayNameUnchanged = normalizedDisplayName === savedDisplayName.trim();
  const emailConfirmationProcessed = searchParams.get("emailChange") === "confirmed";

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalizedDisplayName.length > DISPLAY_NAME_LIMIT) {
      setProfileFeedback({ error: `Display name must be ${DISPLAY_NAME_LIMIT} characters or fewer.` });
      return;
    }

    setProfileBusy(true);
    setProfileFeedback({});
    try {
      await updateDisplayName(normalizedDisplayName || null);
      setDisplayName(normalizedDisplayName);
      setProfileFeedback({ success: "Display name updated." });
    } catch (error) {
      setProfileFeedback({
        error: error instanceof Error ? error.message : "Your display name could not be updated.",
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = newEmail.trim();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailFeedback({ error: "Enter a valid email address." });
      return;
    }
    if (normalizedEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailFeedback({ error: "Enter an email address different from your current one." });
      return;
    }

    setEmailBusy(true);
    setEmailFeedback({});
    try {
      await requestEmailChange(normalizedEmail);
      setNewEmail("");
      setEmailFeedback({
        success:
          "Confirmation requested. Your current email stays active until the required confirmation links are completed.",
      });
    } catch (error) {
      setEmailFeedback({
        error: error instanceof Error ? error.message : "Your email change could not be requested.",
      });
    } finally {
      setEmailBusy(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 8) {
      setPasswordFeedback({ error: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ error: "New password and confirmation do not match." });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordFeedback({ error: "Choose a new password that differs from your current password." });
      return;
    }

    setPasswordBusy(true);
    setPasswordFeedback({});
    try {
      try {
        await verifyCurrentPassword(currentPassword);
      } catch {
        setPasswordFeedback({ error: "The current password could not be verified." });
        return;
      }

      await updatePassword(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({
        success: "Password updated. Use the new password the next time you sign in.",
      });
    } catch (error) {
      setPasswordFeedback({
        error: error instanceof Error ? error.message : "Your password could not be updated.",
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  function clearProfileFeedback() {
    if (profileFeedback.error || profileFeedback.success) setProfileFeedback({});
  }

  function clearEmailFeedback() {
    if (emailFeedback.error || emailFeedback.success) setEmailFeedback({});
  }

  function clearPasswordFeedback() {
    if (passwordFeedback.error || passwordFeedback.success) setPasswordFeedback({});
  }

  return (
    <AppShell>
      <div className="dashboard-page settings-page">
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="eyebrow">Your account</p>
            <h1>Account Settings</h1>
            <p>Keep your identity and sign-in details accurate and secure.</p>
          </div>
        </header>

        {emailConfirmationProcessed && (
          <div className="settings-notice" role="status">
            <strong>Confirmation link processed.</strong>
            <span>
              Your current account email is shown below. If it has not changed yet, complete the
              confirmation sent to the other address.
            </span>
          </div>
        )}

        <div className="settings-sections">
          <section className="settings-section" aria-labelledby="profile-settings-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="profile-settings-title">Profile</h2>
                <p>Choose the name Zoption uses when addressing you.</p>
              </div>
              <span>Public inside your workspace</span>
            </div>

            <form
              className="settings-form"
              onSubmit={(event) => void handleProfileSubmit(event)}
              aria-busy={profileBusy}
            >
              <label>
                <span>Display name</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  maxLength={DISPLAY_NAME_LIMIT}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    clearProfileFeedback();
                  }}
                  disabled={profileBusy}
                  placeholder="How should we address you?"
                />
                <small>Leave this blank to use your email address instead.</small>
              </label>
              {profileFeedback.error && (
                <p className="form-error" role="alert">
                  {profileFeedback.error}
                </p>
              )}
              {profileFeedback.success && (
                <p className="form-success" role="status">
                  {profileFeedback.success}
                </p>
              )}
              <div className="settings-form-actions">
                <button
                  className="button primary compact"
                  type="submit"
                  disabled={profileBusy || displayNameUnchanged}
                >
                  {profileBusy ? "Saving name…" : "Save display name"}
                </button>
              </div>
            </form>
          </section>

          <section className="settings-section" aria-labelledby="email-settings-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="email-settings-title">Email address</h2>
                <p>Your confirmed email is used to sign in and receive secure account links.</p>
              </div>
              <span>Confirmation required</span>
            </div>

            <div className="current-account-value">
              <span>Current email</span>
              <strong>{currentEmail || "No email address is attached to this account"}</strong>
              {pendingEmail && <small>Pending confirmation: {pendingEmail}</small>}
            </div>

            <form
              className="settings-form"
              onSubmit={(event) => void handleEmailSubmit(event)}
              aria-busy={emailBusy}
            >
              <label>
                <span>New email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => {
                    setNewEmail(event.target.value);
                    clearEmailFeedback();
                  }}
                  disabled={emailBusy || !currentEmail}
                  required
                />
                <small>
                  Supabase may send confirmation links to both your current and new addresses.
                </small>
              </label>
              {emailFeedback.error && (
                <p className="form-error" role="alert">
                  {emailFeedback.error}
                </p>
              )}
              {emailFeedback.success && (
                <p className="form-success" role="status">
                  {emailFeedback.success}
                </p>
              )}
              <div className="settings-form-actions">
                <button
                  className="button primary compact"
                  type="submit"
                  disabled={emailBusy || !currentEmail}
                >
                  {emailBusy ? "Sending confirmation…" : "Change email"}
                </button>
              </div>
            </form>
          </section>

          <section className="settings-section" aria-labelledby="password-settings-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="password-settings-title">Password</h2>
                <p>Verify your current password before replacing it with a new one.</p>
              </div>
              <span>Minimum 8 characters</span>
            </div>

            <form
              className="settings-form"
              onSubmit={(event) => void handlePasswordSubmit(event)}
              aria-busy={passwordBusy}
            >
              <label>
                <span>Current password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    clearPasswordFeedback();
                  }}
                  disabled={passwordBusy || !currentEmail}
                  required
                />
              </label>
              <div className="settings-password-row">
                <label>
                  <span>New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      clearPasswordFeedback();
                    }}
                    disabled={passwordBusy || !currentEmail}
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      clearPasswordFeedback();
                    }}
                    disabled={passwordBusy || !currentEmail}
                    minLength={8}
                    required
                  />
                </label>
              </div>
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
                  {passwordBusy ? "Updating password…" : "Update password"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
