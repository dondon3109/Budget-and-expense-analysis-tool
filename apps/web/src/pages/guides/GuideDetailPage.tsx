import { ArrowRight, ChevronRight, Clock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { FINANCE_GUIDES, getFinanceGuideBySlug } from "@zoption/shared";

import { BrandMark } from "../../components/brand/BrandMark";
import { Breadcrumbs } from "../../components/navigation/Breadcrumbs";
import { LegalFooter } from "../../components/legal/LegalFooter";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import "./GuideDetailPage.css";

interface GuideDetailPageProps {
  slug?: string;
}

export function GuideDetailPage({ slug: propSlug }: GuideDetailPageProps = {}) {
  const params = useParams<{ slug?: string }>();
  const activeSlug = propSlug ?? params.slug ?? "";
  const guide = getFinanceGuideBySlug(activeSlug);

  if (!guide) {
    return (
      <div className="legal-page">
        <header className="legal-page-header">
          <Link className="brand compact" to="/" aria-label="Zoption home">
            <BrandMark />
            <span className="brand-wordmark">Zoption</span>
          </Link>
          <ThemeToggle />
        </header>
        <main className="legal-page-main">
          <article className="legal-article">
            <header className="legal-article-header">
              <Breadcrumbs
                items={[
                  { label: "Home", to: "/" },
                  { label: "Guides", to: "/guides" },
                  { label: "Guide Not Found" },
                ]}
              />
              <Link className="legal-back-link" to="/guides">
                ← Back to all guides
              </Link>
              <h1>Guide not found</h1>
            </header>
            <div className="guide-not-found">
              <h2>Looking for personal finance tutorials?</h2>
              <p>
                The guide you requested could not be found. Explore our comprehensive library of
                privacy-first finance guides below.
              </p>
              <Link className="button primary" to="/guides">
                Browse all guides <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </main>
        <LegalFooter />
      </div>
    );
  }

  const relatedGuides = FINANCE_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 2);

  return (
    <div className="legal-page">
      <header className="legal-page-header">
        <Link className="brand compact" to="/" aria-label="Zoption home">
          <BrandMark />
          <span className="brand-wordmark">Zoption</span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="legal-page-main">
        <article className="legal-article">
          <header className="legal-article-header">
            <Breadcrumbs
              items={[
                { label: "Home", to: "/" },
                { label: "Guides", to: "/guides" },
                { label: guide.title },
              ]}
            />
            <Link className="legal-back-link" to="/guides">
              ← Back to all guides
            </Link>
            <div className="guide-detail-meta-bar">
              <span className="guide-category-badge">{guide.category}</span>
              <span className="guide-read-time">
                <Clock size={12} aria-hidden="true" />
                {guide.readTimeMinutes} min read
              </span>
              <span className="guide-detail-author">By {guide.author}</span>
            </div>
            <h1>{guide.title}</h1>
            <p className="legal-summary">{guide.description}</p>
            <p className="legal-updated">Last updated: {guide.updatedDate}</p>
          </header>

          <div className="guide-detail-page">
            {guide.sections.length > 1 && (
              <nav className="guide-toc" aria-label="Table of contents">
                <h2 className="guide-toc-title">Table of contents</h2>
                <ol className="guide-toc-list">
                  {guide.sections.map((section, idx) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`} className="guide-toc-link">
                        <ChevronRight size={13} aria-hidden="true" />
                        <span>
                          {idx + 1}. {section.title}
                        </span>
                      </a>
                    </li>
                  ))}
                  {guide.faqs.length > 0 && (
                    <li>
                      <a href="#frequently-asked-questions" className="guide-toc-link">
                        <ChevronRight size={13} aria-hidden="true" />
                        <span>Frequently asked questions</span>
                      </a>
                    </li>
                  )}
                </ol>
              </nav>
            )}

            <div className="guide-sections-container">
              {guide.sections.map((section) => (
                <section key={section.id} id={section.id} className="guide-content-section">
                  <h2 className="guide-section-heading">{section.title}</h2>
                  <p className="guide-section-body">{section.content}</p>
                  {section.keyTakeaways && section.keyTakeaways.length > 0 && (
                    <div className="guide-takeaways-box">
                      <h3 className="guide-takeaways-title">Key takeaways</h3>
                      <ul className="guide-takeaways-list">
                        {section.keyTakeaways.map((takeaway, i) => (
                          <li key={i}>{takeaway}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </div>

            {guide.faqs.length > 0 && (
              <section id="frequently-asked-questions" className="guide-faqs-section">
                <h2 className="guide-faqs-heading">Frequently asked questions</h2>
                {guide.faqs.map((faq) => (
                  <div key={faq.question} className="guide-faq-item">
                    <h3 className="guide-faq-question">{faq.question}</h3>
                    <p className="guide-faq-answer">{faq.answer}</p>
                  </div>
                ))}
              </section>
            )}

            {relatedGuides.length > 0 && (
              <section className="guide-related-section" aria-label="Related guides">
                <h2 className="guide-related-heading">More financial guides</h2>
                <div className="guide-related-grid">
                  {relatedGuides.map((related) => (
                    <Link
                      key={related.slug}
                      to={`/guides/${related.slug}`}
                      className="guide-related-card"
                    >
                      <h3>{related.title}</h3>
                      <p>{related.description}</p>
                      <span className="guide-read-more">
                        Read guide <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="guides-page-cta">
              <h2>Put this guide into practice</h2>
              <p>
                Start tracking with Zoption for free — no bank logins, zero cloud lock-in, and
                complete privacy for your Philippine financial records.
              </p>
              <div className="guides-cta-actions">
                <Link className="button primary" to="/signup">
                  Create your workspace <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link className="button secondary" to="/install">
                  Download Android Beta APK
                </Link>
              </div>
            </section>
          </div>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
