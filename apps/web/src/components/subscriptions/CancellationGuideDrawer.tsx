import type { CancellationGuide, SubscriptionMonthItem } from "@zoption/shared";
import { findCancellationGuide } from "@zoption/shared";
import { AlertCircle, ExternalLink, HelpCircle, ShieldAlert, X } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import "./CancellationGuideDrawer.css";

interface CancellationGuideDrawerProps {
  item: SubscriptionMonthItem | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Renders the open drawer through a mounted-only child so the focus trap's
 * mount effect runs when the drawer actually opens rather than on first render.
 */
export function CancellationGuideDrawer({ item, isOpen, onClose }: CancellationGuideDrawerProps) {
  if (!isOpen || !item) return null;
  return <CancellationGuideContent item={item} onClose={onClose} />;
}

function CancellationGuideContent({
  item,
  onClose,
}: {
  item: SubscriptionMonthItem;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useRootLock(true);

  const handleKeyDown = useFocusTrap(drawerRef, {
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

  const guide: CancellationGuide | null = findCancellationGuide(item.name);

  // Portalled so the inert application root from useRootLock does not disable the drawer.
  return createPortal(
    <div className="cancellation-drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="cancellation-drawer-content"
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancellation-drawer-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="cancellation-drawer-header">
          <div className="cancellation-drawer-title-group">
            <span className="cancellation-drawer-badge">Cancellation Guide</span>
            <h2 id="cancellation-drawer-title">{item.name}</h2>
          </div>
          <button
            ref={closeRef}
            className="icon-button compact"
            type="button"
            onClick={onClose}
            aria-label="Close cancellation drawer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="cancellation-drawer-body">
          {guide ? (
            <>
              <div className="cancellation-guide-summary-card">
                <h3>{guide.name}</h3>
                <p>{guide.summary}</p>
                {guide.directUrl && (
                  <a
                    className="button secondary cancellation-direct-link"
                    href={guide.directUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span>Open official cancellation portal</span>
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
              </div>

              <div className="cancellation-warning-banner" role="alert">
                <ShieldAlert size={18} className="warning-icon" aria-hidden="true" />
                <div>
                  <strong>Billing Cutoff Notice</strong>
                  <p>{guide.cutoffWarning}</p>
                </div>
              </div>

              <div className="cancellation-steps-section">
                <h3>Step-by-step instructions</h3>
                <ol className="cancellation-steps-list">
                  {guide.steps.map((step, index) => (
                    <li key={index}>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <div className="cancellation-generic-guide">
              <div className="cancellation-guide-summary-card">
                <div className="generic-header">
                  <HelpCircle size={20} className="generic-icon" aria-hidden="true" />
                  <h3>General Cancellation Guidelines</h3>
                </div>
                <p>
                  We don't have a direct 1-click guide on file for <strong>{item.name}</strong>, but here are the standard steps to stop recurring charges:
                </p>
              </div>

              <div className="cancellation-warning-banner" role="alert">
                <AlertCircle size={18} className="warning-icon" aria-hidden="true" />
                <div>
                  <strong>Billing Cycle Notice</strong>
                  <p>
                    Most subscription services require cancellation at least 24 to 48 hours before the renewal date to avoid being billed for the subsequent period.
                  </p>
                </div>
              </div>

              <ol className="cancellation-steps-list">
                <li>
                  <span>
                    <strong>Identify Billing Channel:</strong> Check whether {item.name} is billed directly on their website, via Apple App Store, Google Play Store, or GCash/Maya AutoPay.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Account / Billing Settings:</strong> Log in to the service's website or app, navigate to Account Settings &gt; Subscriptions or Billing.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Cancel &amp; Save Proof:</strong> Select 'Cancel Subscription' or 'Turn off Auto-Renewal' and retain the confirmation email or screenshot.
                  </span>
                </li>
              </ol>
            </div>
          )}

          <div className="cancellation-drawer-footer-note">
            <p>
              <em>Note:</em> Marking a subscription as canceled in Zoption tracks your local budget and stops renewal reminders; it does not automatically contact the merchant or dispute past bank charges.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
