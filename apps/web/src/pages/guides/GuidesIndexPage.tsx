import { useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { FINANCE_GUIDES, type FinanceGuide } from "@zoption/shared";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import "./GuidesIndexPage.css";

const CATEGORY_LABELS: Record<FinanceGuide["category"] | "all", string> = {
  all: "All Guides",
  budgeting: "Budgeting",
  subscriptions: "Subscriptions",
  banking: "Digital Banking",
  tools: "Tools & Spreadsheets",
};

export function GuidesIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState<FinanceGuide["category"] | "all">("all");

  const filteredGuides =
    selectedCategory === "all"
      ? FINANCE_GUIDES
      : FINANCE_GUIDES.filter((guide) => guide.category === selectedCategory);

  return (
    <LegalPageLayout
      title="Personal Finance & Budgeting Guides"
      summary="In-depth tutorials and actionable strategies for private budgeting, e-wallet tracking, subscription management, and digital banking in the Philippines."
      lastUpdated="August 30, 2026"
    >
      <div className="guides-index-page">
        <nav className="guides-category-nav" aria-label="Filter guides by category">
          {(Object.keys(CATEGORY_LABELS) as (FinanceGuide["category"] | "all")[]).map((category) => (
            <button
              key={category}
              type="button"
              className={`guides-category-pill ${selectedCategory === category ? "active" : ""}`}
              onClick={() => setSelectedCategory(category)}
              aria-pressed={selectedCategory === category}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </nav>

        <section className="guides-grid" aria-label="Available financial guides">
          {filteredGuides.map((guide) => (
            <Link
              key={guide.slug}
              to={`/guides/${guide.slug}`}
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
            </Link>
          ))}
        </section>

        <section className="guides-page-cta">
          <h2>Put these guides into practice</h2>
          <p>
            Track your expenses privately without connecting your bank credentials. Import e-wallet
            CSVs, scan receipts, and forecast cashflow with exact centavo precision.
          </p>
          <div className="guides-cta-actions">
            <Link className="button primary" to="/signup">
              Create your free workspace <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/install">
              Download Android Beta APK
            </Link>
          </div>
        </section>
      </div>
    </LegalPageLayout>
  );
}
