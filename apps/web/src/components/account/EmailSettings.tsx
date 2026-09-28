import { useState, type FormEvent } from "react";

import { useAuth } from "../../auth/AuthProvider";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Feedback {
  error?: string;
  success?: string;
}

/** The sign-in email address and the confirmation flow that changes it. */
export function EmailSettings() {
  const { user, requestEmailChange } = useAuth();
  const currentEmail = user?.email ?? "";
  const pendingEmail = user?.new_email;
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>({});

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

  function clearEmailFeedback() {
    if (emailFeedback.error || emailFeedback.success) setEmailFeedback({});
  }

  return (
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
  );
}
