import { ChevronDown, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { FAQ_ITEMS_PUBLIC } from "../../seo/siteMetadata";
import "./FaqPage.css";

/** Categories are declared here so the published FAQ list stays the single source of answers. */
const FAQ_CATEGORY_BY_QUESTION: Record<string, string> = {
  "Can I use Zoption for free?": "Getting started",
  "Do I need financial expertise to use Zoption?": "Getting started",
  "Does Zoption connect to my bank?": "Importing your data",
  "What file formats can I import?": "Importing your data",
  "How are money amounts stored?": "Budgets & tracking",
  "How do transfers between accounts work?": "Budgets & tracking",
  "Can I track subscriptions and recurring charges?": "Budgets & tracking",
  "How does automatic savings interest work?": "Budgets & tracking",
  "How does the AI Financial Assistant work, and what does it read?": "AI assistant",
  "Is my workspace private?": "Privacy & data",
  "How can I export or delete my data?": "Privacy & data",
  "How does Zoption billing work?": "Plans & billing",
  "How do I add Zoption as a Preferred Source in Google Search and AI results?": "Finding Zoption",
};

const FALLBACK_CATEGORY = "More questions";

const CATEGORY_ORDER = [
  "Getting started",
  "Importing your data",
  "Budgets & tracking",
  "AI assistant",
  "Privacy & data",
  "Plans & billing",
  "Finding Zoption",
  FALLBACK_CATEGORY,
];

/** Stable, readable anchor for a question, e.g. #what-file-formats-can-i-import. */
function slugifyQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
}

interface FaqCategory {
  name: string;
  id: string;
  entries: FaqEntry[];
}

export function FaqPage() {
  const { hash } = useLocation();
  const [openId, setOpenId] = useState<string | null>(null);

  const categories = useMemo<FaqCategory[]>(() => {
    const groups = new Map<string, FaqEntry[]>();
    for (const item of FAQ_ITEMS_PUBLIC) {
      const category = FAQ_CATEGORY_BY_QUESTION[item.question] ?? FALLBACK_CATEGORY;
      const entries = groups.get(category) ?? [];
      entries.push({
        id: slugifyQuestion(item.question),
        question: item.question,
        answer: item.answer,
        category,
      });
      groups.set(category, entries);
    }
    return CATEGORY_ORDER.filter((name) => groups.has(name)).map((name) => ({
      name,
      id: `category-${slugifyQuestion(name)}`,
      entries: groups.get(name) ?? [],
    }));
  }, []);

  const toggle = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  // A shared #question-anchor link opens that answer instead of landing on a closed row.
  useEffect(() => {
    const target = hash.replace(/^#/, "");
    if (!target) return;
    const entry = categories
      .flatMap((category) => category.entries)
      .find((item) => item.id === target);
    if (!entry) return;
    setOpenId(entry.id);
    const element = document.getElementById(entry.id);
    element?.scrollIntoView?.({ block: "start" });
  }, [hash, categories]);

  return (
    <LegalPageLayout
      title="Frequently asked questions"
      summary="Plain-language answers about how Zoption tracks expenses, imports files, follows budgets, and handles your data."
      lastUpdated="August 30, 2026"
    >
      <nav className="faq-page-categories" aria-label="FAQ categories">
        {categories.map((category) => (
          <a key={category.id} href={`#${category.id}`}>
            {category.name}
          </a>
        ))}
      </nav>

      <div className="faq-page-list">
        {categories.map((category) => (
          <section
            key={category.id}
            id={category.id}
            className="faq-page-group"
            aria-labelledby={`${category.id}-title`}
          >
            <h2 id={`${category.id}-title`} className="faq-page-group-title">
              {category.name}
            </h2>
            {category.entries.map((entry) => {
              const isOpen = openId === entry.id;
              const answerId = `${entry.id}-answer`;
              return (
                <div className="faq-page-item" id={entry.id} key={entry.id}>
                  <h3 className="faq-page-question">
                    <button
                      type="button"
                      className="faq-page-question-toggle"
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={() => toggle(entry.id)}
                    >
                      <span>{entry.question}</span>
                      <ChevronDown size={18} className="faq-page-chevron" aria-hidden="true" />
                    </button>
                  </h3>
                  <div id={answerId} className="faq-page-answer" hidden={!isOpen}>
                    <p>{entry.answer}</p>
                    <a className="faq-page-anchor" href={`#${entry.id}`}>
                      <Link2 size={12} aria-hidden="true" />
                      Link to this answer
                    </a>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <section className="faq-page-cta">
        <p>
          Still unsure? Create your workspace and see how Zoption turns your own files and entries
          into a clear monthly picture — it starts empty and private, with no bank connection.
        </p>
        <Link className="button" to="/signup">
          Create your workspace
        </Link>
      </section>
    </LegalPageLayout>
  );
}
