import {
  ArrowRight,
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
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  TUTORIAL_CATEGORIES,
  TUTORIALS_DATA,
  filterTutorials,
  type TutorialIconKey,
} from "@zoption/web-common/tutorials";
import {
  isAgentSubmit,
  respondToAgent,
  webMcpFormProps,
  webMcpParamProps,
} from "@zoption/web-common/webmcp";

import { siteUrl } from "../../lib/siteUrl";
import "./TutorialsPage.css";

const TUTORIAL_ICONS: Record<TutorialIconKey, LucideIcon> = {
  sliders: SlidersHorizontal,
  "pie-chart": PieChart,
  camera: Camera,
  "file-spreadsheet": FileSpreadsheet,
  repeat: Repeat,
  "shield-check": ShieldCheck,
};

/** The in-app tutorials view; the public version lives on the site (`apps/site`). */
export function TutorialsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filteredTutorials = useMemo(
    () => filterTutorials(TUTORIALS_DATA, { query: searchQuery, category: activeCategory }),
    [searchQuery, activeCategory],
  );
  const isFiltered = Boolean(searchQuery.trim()) || activeCategory !== "All";

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAgentSubmit(event)) return;

    const formData = new FormData(event.currentTarget);
    const rawQuery = formData.get("query");
    const rawCategory = formData.get("category");
    const nextQuery = typeof rawQuery === "string" ? rawQuery : searchQuery;
    const candidateCategory =
      typeof rawCategory === "string"
        ? rawCategory.toLowerCase() === "all"
          ? "All"
          : rawCategory
        : activeCategory;
    const nextCategory = TUTORIAL_CATEGORIES.includes(candidateCategory)
      ? candidateCategory
      : activeCategory;

    setSearchQuery(nextQuery);
    setActiveCategory(nextCategory);

    const matches = filterTutorials(TUTORIALS_DATA, {
      query: nextQuery,
      category: nextCategory,
    });
    respondToAgent(event, {
      query: nextQuery.trim(),
      category: nextCategory,
      totalCount: TUTORIALS_DATA.length,
      matchCount: matches.length,
      matches: matches.map((tutorial) => ({
        id: tutorial.id,
        title: tutorial.title,
        category: tutorial.category,
        summary: tutorial.summary,
      })),
    });
  }

  return (
    <div className="tutorials-page">
      <header className="tutorials-hero">
        <h1>How to Use Zoption</h1>

        <form
          className="tutorials-filter-form"
          onSubmit={handleFilterSubmit}
          {...webMcpFormProps({
            name: "filter-tutorials",
            description:
              "Search and filter Zoption step-by-step tutorials by keyword and category. Use when the user asks how to use a Zoption feature.",
            autoSubmit: true,
          })}
        >
          <div className="tutorials-search-bar">
            <Search size={18} className="tutorials-search-icon" aria-hidden="true" />
            <input
              type="search"
              name="query"
              placeholder="Search tutorials (e.g. adjust balance, scan receipt, budgets)..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search tutorials"
              {...webMcpParamProps(
                "Keywords to match across tutorial titles, summaries, categories, steps, and tips.",
              )}
            />
            {searchQuery && (
              <button
                type="button"
                className="tutorials-clear-search"
                onClick={() => setSearchQuery("")}
              >
                Clear
              </button>
            )}
          </div>

          <fieldset
            className="tutorials-categories"
            {...webMcpParamProps("Tutorial category to filter by.")}
          >
            <legend className="sr-only">Tutorial categories</legend>
            {TUTORIAL_CATEGORIES.map((cat) => {
              const value = cat === "All" ? "all" : cat;
              const active = activeCategory === cat;
              return (
                <label key={cat} className={`tutorials-category-pill ${active ? "active" : ""}`}>
                  <input
                    type="radio"
                    className="sr-only"
                    name="category"
                    value={value}
                    checked={active}
                    onChange={() => setActiveCategory(cat)}
                  />
                  <span>{cat}</span>
                </label>
              );
            })}
          </fieldset>

          {isFiltered && (
            <p className="tutorials-filter-status" role="status" aria-live="polite">
              Showing {filteredTutorials.length} of {TUTORIALS_DATA.length} tutorials
            </p>
          )}
        </form>
      </header>

      <div className="tutorials-list">
        {filteredTutorials.length === 0 ? (
          <div className="tutorials-empty">
            <HelpCircle size={32} aria-hidden="true" />
            <h2>No tutorials found</h2>
            <p>Try searching with different keywords or switch back to "All".</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("All");
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          filteredTutorials.map((tutorial) => {
            const Icon = TUTORIAL_ICONS[tutorial.icon];
            return (
              <article key={tutorial.id} id={tutorial.id} className="tutorial-card">
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
                    <Link to={tutorial.actionHref} className="button secondary">
                      <span>{tutorial.actionText}</span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </footer>
                )}
              </article>
            );
          })
        )}
      </div>

      <section className="tutorials-help-banner">
        <h2>Still need assistance?</h2>
        <div className="tutorials-help-actions">
          <Link to="/app/assistant" className="button primary">
            Ask AI Assistant
          </Link>
          <Link to={siteUrl("/faq")} className="button secondary">
            Read FAQ
          </Link>
        </div>
      </section>
    </div>
  );
}
