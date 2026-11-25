import {
  ArrowRight,
  BookOpen,
  Camera,
  FileSpreadsheet,
  HelpCircle,
  PieChart,
  Repeat,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  TUTORIAL_CATEGORIES,
  TUTORIALS_DATA,
  tutorialSearchText,
  type TutorialIconKey,
} from "@zoption/web-common/tutorials";
import { webMcpFormProps, webMcpParamProps } from "@zoption/web-common/webmcp";

import { LegalFooter } from "../../components/legal/LegalFooter";
import { PublicHeader } from "../../components/navigation/PublicHeader";
import { appUrl, NEW_TAB } from "../../lib/appUrl";
import "./TutorialsPage.css";

const TUTORIAL_ICONS: Record<TutorialIconKey, LucideIcon> = {
  sliders: SlidersHorizontal,
  "pie-chart": PieChart,
  camera: Camera,
  "file-spreadsheet": FileSpreadsheet,
  repeat: Repeat,
  "shield-check": ShieldCheck,
};

/**
 * Every tutorial is in the HTML; the search box and category pills filter it
 * through `src/client/site.ts`.
 */
export function TutorialsPage() {
  const content = (
    <div className="tutorials-page">
      <header className="tutorials-hero">
        <div className="tutorials-hero-badge">
          <BookOpen size={14} aria-hidden="true" />
          <span>User Guides & Tutorials</span>
        </div>
        <h1>How to Use Zoption</h1>
        <p className="tutorials-hero-sub">
          Step-by-step walkthroughs to help you master your budget, adjust balances, scan receipts,
          and reach your financial goals.
        </p>

        <form
          className="tutorials-filter-form"
          data-filter-form="tutorials"
          {...webMcpFormProps({
            name: "filter-tutorials",
            description:
              "Search and filter Zoption step-by-step tutorials by keyword and category. Use when a visitor asks how to use a Zoption feature.",
            autoSubmit: true,
          })}
        >
          <div className="tutorials-search-bar">
            <Search size={18} className="tutorials-search-icon" aria-hidden="true" />
            <input
              type="search"
              name="query"
              placeholder="Search tutorials (e.g. adjust balance, scan receipt, budgets)..."
              aria-label="Search tutorials"
              data-filter-search="tutorials"
              {...webMcpParamProps(
                "Keywords to match across tutorial titles, summaries, categories, steps, and tips.",
              )}
            />
            <button
              type="button"
              className="tutorials-clear-search"
              data-filter-clear="tutorials"
              hidden
              aria-label="Clear tutorial search"
            >
              Clear
            </button>
          </div>

          <fieldset
            className="tutorials-categories"
            data-filter-controls="tutorials"
            {...webMcpParamProps("Tutorial category to filter by.")}
          >
            <legend className="sr-only">Tutorial categories</legend>
            {TUTORIAL_CATEGORIES.map((cat) => {
              const value = cat === "All" ? "all" : cat;
              return (
                <label
                  key={cat}
                  className={`tutorials-category-pill ${cat === "All" ? "active" : ""}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="category"
                    value={value}
                    defaultChecked={cat === "All"}
                    data-filter-value={value}
                  />
                  <span>{cat}</span>
                </label>
              );
            })}
          </fieldset>

          <p
            className="tutorials-filter-status"
            data-filter-status="tutorials"
            role="status"
            aria-live="polite"
            hidden
          />
        </form>
      </header>

      <div className="tutorials-list" data-filter-items="tutorials">
        <div className="tutorials-empty" data-filter-empty hidden>
          <HelpCircle size={32} aria-hidden="true" />
          <h2>No tutorials found</h2>
          <p>Try searching with different keywords or switch back to "All".</p>
          <button type="button" className="button secondary" data-filter-reset>
            Reset filters
          </button>
        </div>
        {TUTORIALS_DATA.map((tutorial) => {
          const Icon = TUTORIAL_ICONS[tutorial.icon];
          return (
            <article
              key={tutorial.id}
              id={tutorial.id}
              className="tutorial-card"
              data-filter-value={tutorial.category}
              data-filter-text={tutorialSearchText(tutorial)}
            >
              <header className="tutorial-card-header">
                <div className="tutorial-icon-box">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <div>
                  <span className="tutorial-category-tag">{tutorial.category}</span>
                  <h2>{tutorial.title}</h2>
                  <p className="tutorial-summary">{tutorial.summary}</p>
                </div>
              </header>

              <div className="tutorial-steps">
                {tutorial.steps.map((step, index) => (
                  <div key={index} className="tutorial-step-item">
                    <div className="tutorial-step-indicator">
                      <span className="tutorial-step-number">{index + 1}</span>
                    </div>
                    <div className="tutorial-step-body">
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                      {step.tip && (
                        <div className="tutorial-tip">
                          <strong>Tip:</strong> {step.tip}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {tutorial.actionHref && tutorial.actionText && (
                <footer className="tutorial-card-footer">
                  <a href={appUrl(tutorial.actionHref)} className="button secondary">
                    <span>{tutorial.actionText}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </a>
                </footer>
              )}
            </article>
          );
        })}
      </div>

      <section className="tutorials-help-banner">
        <div>
          <h2>Still need help?</h2>
          <p>
            The built-in AI Support Assistant answers questions 24/7, and our support team replies
            within 24 to 48 business hours.
          </p>
        </div>
        <div className="tutorials-help-actions">
          <a href={appUrl("/signup")} {...NEW_TAB} className="button primary">
            Get Started Free
          </a>
          <a href="/faq" className="button secondary">
            Read FAQ
          </a>
        </div>
      </section>
    </div>
  );

  return (
    <div className="public-tutorials-layout">
      <PublicHeader />
      <main id="main-content" tabIndex={-1}>
        {content}
      </main>
      <LegalFooter />
    </div>
  );
}
