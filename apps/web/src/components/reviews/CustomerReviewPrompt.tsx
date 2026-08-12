import { Check, MessageCircleHeart, Star, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { User } from "@supabase/supabase-js";

import { getCustomerReviewState, saveCustomerReview } from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./CustomerReviewPrompt.css";

const REMIND_LATER_MS = 30 * 24 * 60 * 60 * 1_000;

function displayNameFor(user: User): string {
  const emailName = user.email
    ?.split("@", 1)[0]
    ?.replace(/[._-]+/g, " ")
    .trim();
  const friendlyEmailName = emailName?.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  return friendlyEmailName && friendlyEmailName.length >= 2
    ? friendlyEmailName.slice(0, 50)
    : "Zoption customer";
}

export function CustomerReviewPrompt({
  user,
  workspace,
}: {
  user: User;
  workspace: AuthenticatedWorkspace;
}) {
  const storageKey = `zoption:review-reminder:${user.id}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return Number(window.localStorage.getItem(storageKey) ?? 0) > Date.now();
  });
  const [rating, setRating] = useState(0);
  const [displayName, setDisplayName] = useState(() => displayNameFor(user));
  const [review, setReview] = useState("");
  const [publishConsent, setPublishConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [promptEligible, setPromptEligible] = useState(false);
  const [hasReview, setHasReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    let active = true;
    getCustomerReviewState(workspace)
      .then((state) => {
        if (!active) return;
        setHasReview(Boolean(state.review));
        setPromptEligible(state.promptEligible);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // The key is stable for the authenticated account; AppShell recreates the workspace object.
  }, [workspace.key]);

  useEffect(() => {
    if (dismissed || submitted) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissPrompt();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });

  function dismissPrompt() {
    window.localStorage.setItem(storageKey, String(Date.now() + REMIND_LATER_MS));
    setDismissed(true);
  }

  async function submitReview() {
    setSaving(true);
    setSaveError(undefined);
    try {
      await saveCustomerReview(workspace, {
        displayName,
        rating,
        review,
        publishConsent: true,
      });
      setSubmitted(true);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Your review could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (dismissed || loading || hasReview || !promptEligible) {
    return null;
  }

  return (
    <aside className="customer-review-prompt" role="dialog" aria-labelledby="review-prompt-title">
      <button
        className="review-prompt-close"
        type="button"
        onClick={dismissPrompt}
        aria-label="Remind me about reviewing Zoption later"
      >
        <X size={18} aria-hidden="true" />
      </button>

      {submitted ? (
        <div className="review-prompt-thanks" role="status">
          <span>
            <Check size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="review-prompt-title">Thank you for sharing.</h2>
            <p>Your review was submitted and will appear only if the Zoption team selects it.</p>
          </div>
          <button className="button primary" type="button" onClick={() => setDismissed(true)}>
            Done
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (rating > 0 && publishConsent && review.trim().length >= 20) {
              void submitReview();
            }
          }}
        >
          <div className="review-prompt-heading">
            <span>
              <MessageCircleHeart size={20} aria-hidden="true" />
            </span>
            <div>
              <p>A small favor</p>
              <h2 id="review-prompt-title">How is Zoption working for you?</h2>
            </div>
          </div>

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
              placeholder="What has become clearer or easier with Zoption?"
              required
            />
            <small aria-hidden="true">{review.length}/600</small>
          </label>
          <p className="review-prompt-wording-note">
            Your review stays in your own words. Zoption does not use AI to rewrite it.
          </p>

          <label className="review-publish-consent">
            <input
              type="checkbox"
              checked={publishConsent}
              onChange={(event) => setPublishConsent(event.target.checked)}
              required
            />
            <span>
              I agree that Zoption may show this review and public name on its landing page.
            </span>
          </label>

          {saveError && (
            <p className="review-prompt-error" role="alert">
              {saveError}
            </p>
          )}

          <div className="review-prompt-actions">
            <button className="button secondary" type="button" onClick={dismissPrompt}>
              Maybe later
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={
                rating === 0 ||
                displayName.trim().length < 2 ||
                review.trim().length < 20 ||
                !publishConsent ||
                saving
              }
            >
              {saving ? "Submitting…" : "Submit review"}
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
