import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { evaluatePassword } from "../auth/passwordPolicy";
import { useAuth } from "../auth/AuthProvider";
import { PasswordField } from "../components/auth/PasswordField";
import { PasswordGuidance } from "../components/auth/PasswordGuidance";
import { AppShell } from "../components/layout/AppShell";
import { UserAvatar } from "../components/profile/UserAvatar";
import { AVATAR_ACCEPT, avatarPathFromMetadata, validateAvatarFile } from "../lib/avatar";
import "./SettingsPage.css";

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
    updateAvatar,
    removeAvatar,
    requestEmailChange,
    verifyCurrentPassword,
    updatePassword,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const savedDisplayName = displayNameFromMetadata(user?.user_metadata);
  const currentAvatarPath = avatarPathFromMetadata(user?.user_metadata);
  const currentEmail = user?.email ?? "";
  const pendingEmail = user?.new_email;
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(savedDisplayName);
  const [selectedAvatar, setSelectedAvatar] = useState<File>();
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [newPasswordTouched, setNewPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>({});
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback>({});
  const [emailFeedback, setEmailFeedback] = useState<Feedback>({});
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>({});

  useEffect(() => {
    if (!selectedAvatar) {
      setAvatarPreviewUrl(undefined);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedAvatar);
    setAvatarPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedAvatar]);

  const normalizedDisplayName = displayName.trim();
  const displayNameUnchanged = normalizedDisplayName === savedDisplayName.trim();
  const emailConfirmationProcessed = searchParams.get("emailChange") === "confirmed";
  const newPasswordEvaluation = evaluatePassword(newPassword);
  const showNewPasswordError =
    (passwordSubmitted || newPasswordTouched) && !newPasswordEvaluation.isValid;
  const confirmPasswordError =
    (passwordSubmitted || confirmPasswordTouched) && !confirmPassword
      ? "Confirm your password."
      : (passwordSubmitted || confirmPasswordTouched) && newPassword !== confirmPassword
        ? "Passwords do not match."
        : undefined;

  async function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setAvatarFeedback({});
    if (!file) {
      setSelectedAvatar(undefined);
      return;
    }

    try {
      await validateAvatarFile(file);
      setSelectedAvatar(file);
    } catch (error) {
      setSelectedAvatar(undefined);
      event.target.value = "";
      setAvatarFeedback({
        error: error instanceof Error ? error.message : "Choose another profile picture.",
      });
    }
  }

  async function handleAvatarSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAvatar) return;

    setAvatarBusy(true);
    setAvatarFeedback({});
    try {
      const result = await updateAvatar(selectedAvatar);
      setSelectedAvatar(undefined);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      setAvatarFeedback({
        success: result.cleanupWarning
          ? `Profile picture updated. ${result.cleanupWarning}`
          : "Profile picture updated.",
      });
    } catch (error) {
      setAvatarFeedback({
        error:
          error instanceof Error ? error.message : "Your profile picture could not be updated.",
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarBusy(true);
    setAvatarFeedback({});
    try {
      const result = await removeAvatar();
      setSelectedAvatar(undefined);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      setAvatarFeedback({
        success: result.cleanupWarning
          ? `Profile picture removed. ${result.cleanupWarning}`
          : "Profile picture removed.",
      });
    } catch (error) {
      setAvatarFeedback({
        error:
          error instanceof Error ? error.message : "Your profile picture could not be removed.",
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalizedDisplayName.length > DISPLAY_NAME_LIMIT) {
      setProfileFeedback({
        error: `Display name must be ${DISPLAY_NAME_LIMIT} characters or fewer.`,
      });
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
    setPasswordSubmitted(true);

    if (!newPasswordEvaluation.isValid) {
      setPasswordFeedback({ error: "New password must meet every requirement." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ error: "New password and confirmation do not match." });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordFeedback({
        error: "Choose a new password that differs from your current password.",
      });
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
      setPasswordSubmitted(false);
      setNewPasswordTouched(false);
      setConfirmPasswordTouched(false);
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
                <p>Choose the name and picture Zoption uses to identify you.</p>
              </div>
              <span>Picture uses a public link</span>
            </div>

            <form
              className="avatar-settings"
              onSubmit={(event) => void handleAvatarSubmit(event)}
              aria-busy={avatarBusy}
            >
              <UserAvatar
                avatarPath={currentAvatarPath}
                previewUrl={avatarPreviewUrl}
                displayName={normalizedDisplayName || savedDisplayName}
                email={currentEmail}
                alt="Profile picture preview"
                size="large"
              />
              <div className="avatar-settings-content">
                <label htmlFor="profile-picture">
                  <span>
                    {selectedAvatar ? "Picture ready to save" : "Choose a profile picture"}
                  </span>
                  <input
                    ref={avatarInputRef}
                    id="profile-picture"
                    type="file"
                    accept={AVATAR_ACCEPT}
                    onChange={(event) => void handleAvatarSelection(event)}
                    disabled={avatarBusy}
                  />
                  <small>
                    JPEG, PNG, or WebP. Maximum 2 MB and 4096 × 4096 pixels. Anyone with the picture
                    link can view it.
                  </small>
                </label>
                {selectedAvatar && <small>Selected: {selectedAvatar.name}</small>}
                {avatarFeedback.error && (
                  <p className="form-error" role="alert">
                    {avatarFeedback.error}
                  </p>
                )}
                {avatarFeedback.success && (
                  <p className="form-success" role="status">
                    {avatarFeedback.success}
                  </p>
                )}
                <div className="avatar-settings-actions">
                  <button
                    className="button primary compact"
                    type="submit"
                    disabled={avatarBusy || !selectedAvatar}
                  >
                    {avatarBusy && selectedAvatar ? "Saving picture…" : "Save picture"}
                  </button>
                  {selectedAvatar && (
                    <button
                      className="button secondary compact"
                      type="button"
                      onClick={() => {
                        setSelectedAvatar(undefined);
                        if (avatarInputRef.current) avatarInputRef.current.value = "";
                        setAvatarFeedback({});
                      }}
                      disabled={avatarBusy}
                    >
                      Cancel selection
                    </button>
                  )}
                  {currentAvatarPath && !selectedAvatar && (
                    <button
                      className="button secondary compact"
                      type="button"
                      onClick={() => void handleAvatarRemove()}
                      disabled={avatarBusy}
                    >
                      {avatarBusy ? "Removing picture…" : "Remove picture"}
                    </button>
                  )}
                </div>
              </div>
            </form>

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
              <span>12+ characters and mixed character types</span>
            </div>

            <form
              className="settings-form"
              onSubmit={(event) => void handlePasswordSubmit(event)}
              aria-busy={passwordBusy}
            >
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
                  aria-describedby={
                    confirmPasswordError ? "settings-confirm-password-error" : undefined
                  }
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
