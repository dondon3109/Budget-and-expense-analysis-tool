import { ArrowRight, ChevronRight, Clock } from "lucide-react";
import { FINANCE_GUIDES, type FinanceGuide } from "@zoption/shared";

import { Breadcrumbs } from "../../components/navigation/Breadcrumbs";
import { PublicHeader } from "../../components/navigation/PublicHeader";
import { LegalFooter } from "../../components/legal/LegalFooter";
import "./GuideDetailPage.css";
import { appUrl, NEW_TAB } from "../../lib/appUrl";

/** Only published guides are built, so an unknown slug is the site 404, not a page state. */
export function GuideDetailPage({ guide }: { guide: FinanceGuide }) {
  const relatedGuides = FINANCE_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 2);

  return (
    <div className="legal-page">
      <PublicHeader />
      <main className="legal-page-main" id="main-content" tabIndex={-1}>
        <article className="legal-article">
          <header className="legal-article-header">
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Guides", href: "/guides" },
                { label: guide.title },
              ]}
            />
            <a className="legal-back-link" href="/guides">
              ← Back to all guides
            </a>
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

            {guide.relatedLinks && guide.relatedLinks.length > 0 && (
              <section className="guide-related-section" aria-label="Related tools">
                <h2 className="guide-related-heading">Put the numbers to work</h2>
                <div className="guide-related-grid">
                  {guide.relatedLinks.map((link) => (
                    <a key={link.to} href={link.to} className="guide-related-card">
                      <h3>{link.label}</h3>
                      <p>{link.description}</p>
                      <span className="guide-read-more">
                        Open <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {relatedGuides.length > 0 && (
              <section className="guide-related-section" aria-label="Related guides">
                <h2 className="guide-related-heading">More financial guides</h2>
                <div className="guide-related-grid">
                  {relatedGuides.map((related) => (
                    <a
                      key={related.slug}
                      href={`/guides/${related.slug}`}
                      className="guide-related-card"
                    >
                      <h3>{related.title}</h3>
                      <p>{related.description}</p>
                      <span className="guide-read-more">
                        Read guide <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </a>
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
                <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
                  Create your workspace <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a className="button secondary" href="/install">
                  Download Android Beta APK
                </a>
              </div>
            </section>
          </div>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
