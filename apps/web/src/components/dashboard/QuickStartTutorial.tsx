import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CreditCard,
  PieChart,
  PlusCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import "./QuickStartTutorial.css";

const STORAGE_KEY = "zoption:quick-start-tutorial-state";

export interface QuickStartTutorialProps {
  onAdjustBalance?: () => void;
}

export function QuickStartTutorial({ onAdjustBalance }: QuickStartTutorialProps) {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dismissed") {
        setDismissed(true);
      } else if (saved === "collapsed") {
        setCollapsed(true);
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      // Storage unavailable
    }
  }

  function handleToggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
      } catch {
        // Storage unavailable
      }
      return next;
    });
  }

  if (dismissed) {
    return (
      <aside className="quick-start-reopen" aria-label="Tutorial guide prompt">
        <button
          type="button"
          className="quick-start-reopen-button"
          onClick={() => {
            setDismissed(false);
            setCollapsed(false);
            try {
              localStorage.setItem(STORAGE_KEY, "expanded");
            } catch {
              // Storage unavailable
            }
          }}
        >
          <BookOpen size={16} aria-hidden="true" />
          <span>New to Zoption? View Quick Start Tutorial</span>
        </button>
        <Link to="/app/tutorials" className="quick-start-reopen-link">
          Browse all tutorials →
        </Link>
      </aside>
    );
  }

  return (
    <section
      className="quick-start-tutorial-card"
      aria-labelledby="quick-start-heading"
      data-testid="quick-start-tutorial"
    >
      <header className="quick-start-header">
        <div className="quick-start-header-text">
          <div className="quick-start-badge">
            <BookOpen size={14} aria-hidden="true" />
            <span>Getting Started</span>
          </div>
          <h2 id="quick-start-heading">Welcome to Zoption! Quick Start Guide</h2>
          <p>
            Follow these 4 essential steps to set up your workspace and take full control of your
            money.
          </p>
        </div>
        <div className="quick-start-header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={handleToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand Quick Start Tutorial" : "Collapse Quick Start Tutorial"}
            title={collapsed ? "Expand guide" : "Collapse guide"}
          >
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleDismiss}
            aria-label="Dismiss Quick Start Tutorial"
            title="Dismiss guide"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="quick-start-content">
          <div className="quick-start-grid">
            {/* Step 1: Adjust balance */}
            <article className="quick-start-step">
              <div className="quick-start-step-num">1</div>
              <div className="quick-start-step-details">
                <div className="quick-start-step-title-row">
                  <SlidersHorizontal
                    size={16}
                    className="quick-start-step-icon"
                    aria-hidden="true"
                  />
                  <h3>Adjust your balances</h3>
                </div>
                <p>
                  Match your Cash, Bank, and e-wallet balances to what you actually have in real
                  life.
                </p>
                {onAdjustBalance ? (
                  <button
                    type="button"
                    className="button secondary compact-action"
                    onClick={onAdjustBalance}
                  >
                    Adjust balance now
                  </button>
                ) : (
                  <Link to="/app" className="button secondary compact-action">
                    Adjust balance
                  </Link>
                )}
              </div>
            </article>

            {/* Step 2: Budgets */}
            <article className="quick-start-step">
              <div className="quick-start-step-num">2</div>
              <div className="quick-start-step-details">
                <div className="quick-start-step-title-row">
                  <PieChart size={16} className="quick-start-step-icon" aria-hidden="true" />
                  <h3>Set envelope budgets</h3>
                </div>
                <p>
                  Assign spending targets for groceries, dining, utilities, and more to prevent
                  overspending.
                </p>
                <Link to="/app/budgets" className="button secondary compact-action">
                  Set up envelopes
                </Link>
              </div>
            </article>

            {/* Step 3: Add transaction */}
            <article className="quick-start-step">
              <div className="quick-start-step-num">3</div>
              <div className="quick-start-step-details">
                <div className="quick-start-step-title-row">
                  <PlusCircle size={16} className="quick-start-step-icon" aria-hidden="true" />
                  <h3>Log daily spending</h3>
                </div>
                <p>
                  Record expenses by typing, scanning receipts with camera, or using voice
                  dictation.
                </p>
                <Link to="/app/transactions?add=1" className="button secondary compact-action">
                  Log transaction
                </Link>
              </div>
            </article>

            {/* Step 4: Full Tutorials */}
            <article className="quick-start-step">
              <div className="quick-start-step-num">4</div>
              <div className="quick-start-step-details">
                <div className="quick-start-step-title-row">
                  <CreditCard size={16} className="quick-start-step-icon" aria-hidden="true" />
                  <h3>Read full tutorials</h3>
                </div>
                <p>
                  Learn how zero-based budgeting works, how bank SMS parsing works, and tips for
                  family budgets.
                </p>
                <Link to="/app/tutorials" className="button primary compact-action">
                  View tutorials page
                </Link>
              </div>
            </article>
          </div>

          <footer className="quick-start-footer">
            <Link to="/app/tutorials" className="quick-start-all-link">
              Looking for detailed instructions? Visit the dedicated Tutorials Page →
            </Link>
          </footer>
        </div>
      )}
    </section>
  );
}
