import type { CustomerReview, CustomerReviewInput } from "@zoption/shared";
import { Check, MessageCircleHeart, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { deleteCustomerReview, getCustomerReviewState, saveCustomerReview } from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./CustomerReviewSettings.css";

const STATUS_COPY: Record<CustomerReview["moderationStatus"], string> = {
  pending: "Awaiting Zoption review",
  published: "Approved for possible placement",
  hidden: "Not shown publicly",
};

export function CustomerReviewSettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const [savedReview, setSavedReview] = useState<CustomerReview | null>();
  const [displayName, setDisplayName] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [publishConsent, setPublishConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});

  const loadReview = useCallback(async () => {
    setLoading(true);
    setFeedback({});
    try {
      const state = await getCustomerReviewState({ key: workspace.key, userId: workspace.userId });
      setSavedReview(state.review);
      if (state.review) {
        setDisplayName(state.review.displayName);
        setRating(state.review.rating);
        setReview(state.review.review);
        setPublishConsent(state.review.publishConsent);
      }
    } catch (error) {
      setFeedback({
        error: error instanceof Error ? error.message : "Your review could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }, [workspace.key, workspace.userId]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publishConsent) {
      setFeedback({ error: "Confirm that Zoption may show your review before saving it." });
      return;
    }
    setBusy(true);
    setFeedback({});
    const input: CustomerReviewInput = {
      displayName: displayName.trim(),
      rating,
      review: review.trim(),
      publishConsent,
    };
    try {
      const saved = await saveCustomerReview(workspace, input);
      setSavedReview(saved);
      setFeedback({
        success: "Review updated and returned to Zoption for publication review.",
      });
    } catch (error) {
      setFeedback({
        error: error instanceof Error ? error.message : "Your review could not be updated.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setFeedback({});
    try {
      await deleteCustomerReview(workspace);
      setSavedReview(null);
      setDisplayName("");
      setRating(0);
      setReview("");
      setPublishConsent(false);
      setConfirmingRemoval(false);
      setFeedback({ success: "Your customer review was removed." });
    } catch (error) {
      setFeedback({
        error: error instanceof Error ? error.message : "Your review could not be removed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="customer-review"
      className="settings-section customer-review-settings"
      aria-labelledby="customer-review-settings-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="customer-review-settings-title">Your customer review</h2>
          <p>Update or remove the experience you consented to share publicly.</p>
        </div>
        {savedReview && <span>{STATUS_COPY[savedReview.moderationStatus]}</span>}
      </div>

      {loading ? (
        <p className="settings-helper" role="status">
          Loading your review…
        </p>
      ) : feedback.error && savedReview === undefined ? (
        <div className="customer-review-settings-state" role="alert">
          <p>{feedback.error}</p>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => void loadReview()}
          >
            Try again
          </button>
        </div>
      ) : savedReview ? (
        <form
          className="customer-review-settings-form"
          onSubmit={(event) => void handleSave(event)}
        >
          <fieldset className="review-rating">
            <legend>Your rating</legend>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value <= rating ? "selected" : ""}
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  aria-pressed={rating === value}
                  disabled={busy}
                >
                  <Star size={23} aria-hidden="true" fill="currentColor" />
                </button>
              ))}
            </div>
          </fieldset>

          <label className="review-field">
            <span>Public name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={50}
              required
              disabled={busy}
            />
          </label>

          <label className="review-field">
            <span>Your experience</span>
            <textarea
              value={review}
              onChange={(event) => setReview(event.target.value)}
              minLength={20}
              maxLength={600}
              rows={4}
              required
              disabled={busy}
            />
            <small aria-hidden="true">{review.length}/600</small>
          </label>

          <label className="review-publish-consent">
            <input
              type="checkbox"
              checked={publishConsent}
              onChange={(event) => setPublishConsent(event.target.checked)}
              required
              disabled={busy}
            />
            <span>
              I agree that Zoption may show this review and public name on its landing page.
            </span>
          </label>

          <p className="customer-review-settings-note">
            Zoption keeps your review in your own words and does not rewrite it with AI. Saving
            replacement wording removes its current landing placement and returns it to moderation.
          </p>

          {feedback.error && (
            <p className="form-error" role="alert">
              {feedback.error}
            </p>
          )}
          {feedback.success && (
            <p className="form-success" role="status">
              <Check size={15} aria-hidden="true" /> {feedback.success}
            </p>
          )}

          <div className="customer-review-settings-actions">
            <button
              className="button primary compact"
              type="submit"
              disabled={
                busy ||
                rating === 0 ||
                displayName.trim().length < 2 ||
                review.trim().length < 20 ||
                !publishConsent
              }
            >
              {busy && !confirmingRemoval ? "Saving review…" : "Save replacement review"}
            </button>
            <button
              className="button secondary compact"
              type="button"
              disabled={busy}
              onClick={() => setConfirmingRemoval(true)}
            >
              <Trash2 size={15} aria-hidden="true" /> Remove review
            </button>
          </div>

          {confirmingRemoval && (
            <div
              className="customer-review-removal"
              role="group"
              aria-labelledby="remove-review-title"
            >
              <div>
                <strong id="remove-review-title">Remove your review?</strong>
                <p>It will stop appearing publicly and cannot be recovered.</p>
              </div>
              <button
                className="button secondary compact"
                type="button"
                disabled={busy}
                onClick={() => setConfirmingRemoval(false)}
              >
                Keep review
              </button>
              <button
                className="button danger compact"
                type="button"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                {busy ? "Removing…" : "Remove permanently"}
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="customer-review-settings-state">
          <MessageCircleHeart size={22} aria-hidden="true" />
          <div>
            <strong>No customer review submitted</strong>
            <p>Zoption will invite you after you have had enough time to experience the product.</p>
          </div>
          {feedback.success && (
            <p className="form-success" role="status">
              <Check size={15} aria-hidden="true" /> {feedback.success}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
