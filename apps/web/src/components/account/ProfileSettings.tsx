import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { AVATAR_ACCEPT, avatarPathFromMetadata, validateAvatarFile } from "../../lib/avatar";
import { UserAvatar } from "../profile/UserAvatar";

const DISPLAY_NAME_LIMIT = 80;

interface Feedback {
  error?: string;
  success?: string;
}

function displayNameFromMetadata(metadata: Record<string, unknown> | undefined): string {
  return typeof metadata?.display_name === "string" ? metadata.display_name : "";
}

/** Display name and profile picture. */
export function ProfileSettings() {
  const { user, updateDisplayName, updateAvatar, removeAvatar } = useAuth();
  const savedDisplayName = displayNameFromMetadata(user?.user_metadata);
  const currentAvatarPath = avatarPathFromMetadata(user?.user_metadata);
  const currentEmail = user?.email ?? "";
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(savedDisplayName);
  const [selectedAvatar, setSelectedAvatar] = useState<File>();
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>();

  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>({});
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback>({});

  useEffect(() => {
    if (!selectedAvatar) {
      setAvatarPreviewUrl(undefined);
      return;
    }

    const previewUrl = encodeURI(URL.createObjectURL(selectedAvatar));
    setAvatarPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedAvatar]);

  const normalizedDisplayName = displayName.trim();
  const displayNameUnchanged = normalizedDisplayName === savedDisplayName.trim();
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

  function clearProfileFeedback() {
    if (profileFeedback.error || profileFeedback.success) setProfileFeedback({});
  }

  return (
    <section
      id="profile-settings"
      className="settings-section"
      aria-labelledby="profile-settings-title"
      tabIndex={-1}
    >
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
            <span>{selectedAvatar ? "Picture ready to save" : "Choose a profile picture"}</span>
            <input
              ref={avatarInputRef}
              id="profile-picture"
              type="file"
              accept={AVATAR_ACCEPT}
              onChange={(event) => void handleAvatarSelection(event)}
              disabled={avatarBusy}
            />
            <small>
              JPEG, PNG, or WebP. Maximum 2 MB and 4096 × 4096 pixels. Anyone with the picture link
              can view it.
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
  );
}
