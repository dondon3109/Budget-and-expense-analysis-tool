import { ArrowRight, Clock } from "lucide-react";
import { FINANCE_GUIDES, type FinanceGuide } from "@zoption/shared";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import "./GuidesIndexPage.css";
import { appUrl } from "../../lib/appUrl";

const CATEGORY_LABELS: Record<FinanceGuide["category"] | "all", string> = {
  all: "All Guides",
  budgeting: "Budgeting",
  subscriptions: "Subscriptions",
  banking: "Digital Banking",
  tools: "Tools & Spreadsheets",
};

/** Every guide is in the HTML; the category pills filter it through `src/client/site.ts`. */
export function GuidesIndexPage() {
  return (
    <LegalPageLayout
      title="Personal Finance & Budgeting Guides"
      summary="In-depth tutorials and actionable strategies for private budgeting, e-wallet tracking, subscription management, and digital banking in the Philippines."
      lastUpdated="September 16, 2026"
    >
      <div className="guides-index-page">
        <nav
          className="guides-category-nav"
          aria-label="Filter guides by category"
          data-filter-controls="guides"
        >
          {(Object.keys(CATEGORY_LABELS) as (FinanceGuide["category"] | "all")[]).map(
            (category) => (
              <button
                key={category}
                type="button"
                className={`guides-category-pill ${category === "all" ? "active" : ""}`}
                aria-pressed={category === "all"}
                data-filter-value={category}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ),
          )}
        </nav>

        <section
          className="guides-grid"
          aria-label="Available financial guides"
          data-filter-items="guides"
        >
          {FINANCE_GUIDES.map((guide) => (
            <a
              key={guide.slug}
              data-filter-value={guide.category}
              href={`/guides/${guide.slug}`}
              className="guide-card"
              aria-label={`Read guide: ${guide.title}`}
            >
              <header className="guide-card-header">
                <span className="guide-category-badge">{guide.category}</span>
                <span className="guide-read-time">
                  <Clock size={12} aria-hidden="true" />
                  {guide.readTimeMinutes} min read
                </span>
              </header>
              <h2 className="guide-card-title">{guide.title}</h2>
              <p className="guide-card-description">{guide.description}</p>
              <div className="guide-card-footer">
                <span>Updated: {guide.updatedDate}</span>
                <span className="guide-read-more">
                  Read guide <ArrowRight size={14} aria-hidden="true" />
                </span>
              </div>
            </a>
          ))}
        </section>

        <section className="guides-page-cta">
          <h2>Put these guides into practice</h2>
          <p>
            Track your expenses privately without connecting your bank credentials. Import e-wallet
            CSVs, scan receipts, and forecast cashflow with exact centavo precision.
          </p>
          <div className="guides-cta-actions">
            <a className="button primary" href={appUrl("/signup")}>
              Create your free workspace <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a className="button secondary" href="/install">
              Download Android Beta APK
            </a>
          </div>
        </section>
      </div>
    </LegalPageLayout>
  );
}
