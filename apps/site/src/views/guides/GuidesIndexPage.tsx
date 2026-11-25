import { ArrowRight, Clock, HelpCircle, Search } from "lucide-react";
import { FINANCE_GUIDES, type FinanceGuide } from "@zoption/shared";
import { webMcpFormProps, webMcpParamProps } from "@zoption/web-common/webmcp";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { appUrl, NEW_TAB } from "../../lib/appUrl";
import "./GuidesIndexPage.css";

const CATEGORY_LABELS: Record<FinanceGuide["category"] | "all", string> = {
  all: "All Guides",
  budgeting: "Budgeting",
  subscriptions: "Subscriptions",
  banking: "Digital Banking",
  tools: "Tools & Spreadsheets",
};

function guideSearchText(guide: FinanceGuide): string {
  return [
    guide.title,
    guide.description,
    guide.category,
    CATEGORY_LABELS[guide.category],
    ...guide.keywords,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Every guide is in the HTML; the search box and category pills filter it
 * through `src/client/site.ts`.
 */
export function GuidesIndexPage() {
  return (
    <LegalPageLayout
      title="Personal Finance & Budgeting Guides"
      summary="Practical guides for private budgeting, e-wallet tracking, subscription cleanup, and digital banking in the Philippines."
      lastUpdated="November 25, 2026"
    >
      <div className="guides-index-page">
        <form
          className="guides-filter-form"
          data-filter-form="guides"
          {...webMcpFormProps({
            name: "filter-guides",
            description:
              "Search and filter Zoption personal finance guides by keyword and category. Use when a visitor wants practical budgeting, banking, or subscription guides.",
            autoSubmit: true,
          })}
        >
          <div className="guides-search-bar">
            <Search size={18} className="guides-search-icon" aria-hidden="true" />
            <input
              type="search"
              name="query"
              placeholder="Search guides (e.g. GCash, 50/30/20, 13th month, snowball)..."
              aria-label="Search guides"
              data-filter-search="guides"
              {...webMcpParamProps(
                "Keywords to match across guide titles, summaries, categories, and topics.",
              )}
            />
            <button
              type="button"
              className="guides-clear-search"
              data-filter-clear="guides"
              hidden
              aria-label="Clear guide search"
            >
              Clear
            </button>
          </div>

          <fieldset
            className="guides-category-nav"
            data-filter-controls="guides"
            {...webMcpParamProps("Guide category to filter by.")}
          >
            <legend className="sr-only">Filter guides by category</legend>
            {(Object.keys(CATEGORY_LABELS) as (FinanceGuide["category"] | "all")[]).map(
              (category) => (
                <label
                  key={category}
                  className={`guides-category-pill ${category === "all" ? "active" : ""}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="category"
                    value={category}
                    defaultChecked={category === "all"}
                    data-filter-value={category}
                  />
                  <span>{CATEGORY_LABELS[category]}</span>
                </label>
              ),
            )}
          </fieldset>

          <p
            className="guides-filter-status"
            data-filter-status="guides"
            role="status"
            aria-live="polite"
            hidden
          />
        </form>

        <section
          className="guides-grid"
          aria-label="Available financial guides"
          data-filter-items="guides"
        >
          <div className="guides-empty" data-filter-empty hidden>
            <HelpCircle size={28} aria-hidden="true" />
            <h2>No guides found</h2>
            <p>Try a different keyword or switch back to "All Guides".</p>
            <button type="button" className="button secondary" data-filter-reset>
              Reset filters
            </button>
          </div>
          {FINANCE_GUIDES.map((guide) => (
            <a
              key={guide.slug}
              data-filter-value={guide.category}
              data-filter-text={guideSearchText(guide)}
              href={`/guides/${guide.slug}`}
              className="guide-card"
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
            <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
              Create your free workspace <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a className="button secondary" href="/install">
              Get the Android app
            </a>
          </div>
        </section>
      </div>
    </LegalPageLayout>
  );
}
