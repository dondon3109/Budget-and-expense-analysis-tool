import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { isSubscriptionBlocksAccountDeletionError } from "../../lib/api";
import { AccountDeletionDialog } from "./AccountDeletionDialog";

/** Account deletion, which needs a password and is blocked while a paid subscription is active. */
export function DangerZoneSettings({ hasPasswordIdentity }: { hasPasswordIdentity: boolean }) {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const deletionTriggerRef = useRef<HTMLButtonElement>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState<unknown>();

  async function handleAccountDeletion(password: string) {
    setDeletionBusy(true);
    setDeletionError(undefined);
    try {
      const result = await deleteAccount(password);
      void navigate(`/login?accountDeleted=${result.status}`, { replace: true });
    } catch (error) {
      setDeletionError(error);
    } finally {
      setDeletionBusy(false);
    }
  }

  function closeAccountDeletion() {
    if (deletionBusy) return;
    setDeletionOpen(false);
    setDeletionError(undefined);
  }

  function reviewBillingBeforeDeletion() {
    setDeletionOpen(false);
    setDeletionError(undefined);
    window.requestAnimationFrame(() => {
      const billingSection = document.getElementById("plan-and-billing");
      billingSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      billingSection?.focus({ preventScroll: true });
    });
  }

  return (
    <>
      <section
        className="settings-section settings-danger-zone"
        aria-labelledby="account-deletion-title"
      >
        <div className="settings-section-heading">
          <div>
            <h2 id="account-deletion-title">Danger zone</h2>
            <p>
              Permanently remove your Zoption account and the information Zoption controls for it.
            </p>
          </div>
          <span>Cannot be undone</span>
        </div>
        <div className="settings-danger-zone-content">
          <div>
            <strong>Delete your account</strong>
            <p>
              This removes your accounts, transactions, categories, budgets, subscriptions, calendar
              events, imported records, assistant history, profile picture files, and sign-in
              account. Copies you have downloaded or public-avatar caches outside Zoption&apos;s
              control may remain elsewhere.
            </p>
            {!hasPasswordIdentity && (
              <p id="social-account-deletion-help">
                Create a password above before deleting an account that currently uses only a
                connected provider.
              </p>
            )}
          </div>
          <button
            ref={deletionTriggerRef}
            className="button danger compact"
            type="button"
            aria-describedby={hasPasswordIdentity ? undefined : "social-account-deletion-help"}
            disabled={!hasPasswordIdentity}
            onClick={() => setDeletionOpen(true)}
          >
            Delete account
          </button>
        </div>
      </section>
      {deletionOpen && (
        <AccountDeletionDialog
          busy={deletionBusy}
          error={
            deletionError instanceof Error
              ? deletionError.message
              : deletionError
                ? "Your account could not be deleted. Try again."
                : undefined
          }
          billingBlocked={isSubscriptionBlocksAccountDeletionError(deletionError)}
          returnFocus={deletionTriggerRef.current}
          onConfirm={(password) => void handleAccountDeletion(password)}
          onReviewBilling={reviewBillingBeforeDeletion}
          onClose={closeAccountDeletion}
        />
      )}
    </>
  );
}
