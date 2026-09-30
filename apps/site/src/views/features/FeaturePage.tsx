import { ArrowRight } from "lucide-react";
import { getFinanceGuideBySlug } from "@zoption/shared";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { FEATURE_PAGES_LAST_UPDATED, findFeaturePage, type FeaturePagePath } from "./featurePages";
import "../guides/GuideDetailPage.css";
import "../guides/GuidesIndexPage.css";
import "./FeaturePage.css";
import { appUrl, NEW_TAB } from "../../lib/appUrl";

/**
 * Renders one feature explainer. The path is passed by its route file, and every visible
 * value comes from FEATURE_PAGES, so the page, its metadata, and its sitemap entry cannot
 * drift apart. The section and card classes come from the guide pages, which is why their
 * stylesheets are imported here.
 */
export function FeaturePage({ path }: { path: FeaturePagePath }) {
  const page = findFeaturePage(path);
  if (!page) throw new Error(`No feature page registered for ${path}`);

  const relatedGuide = getFinanceGuideBySlug(page.relatedGuideSlug);
  const relatedFeature = findFeaturePage(page.relatedFeaturePath);

  return (
    <LegalPageLayout
      title={page.heading}
      summary={page.summary}
      lastUpdated={FEATURE_PAGES_LAST_UPDATED}
    >
      <div className="feature-page">
        <div className="guide-sections-container">
          {page.sections.map((section) => (
            <section key={section.id} id={section.id} className="guide-content-section">
              <h2 className="guide-section-heading">{section.title}</h2>
              <p className="guide-section-body">{section.body}</p>
              {section.steps && section.steps.length > 0 && (
                <ol className="feature-steps">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        <section className="guide-related-section" aria-label="Keep reading">
          <h2 className="guide-related-heading">Keep reading</h2>
          <div className="guide-related-grid">
            {relatedGuide && (
              <a
                href={`/guides/${relatedGuide.slug}`}
                className="guide-related-card"
                aria-label={`Read guide: ${relatedGuide.title}`}
              >
                <h3>{relatedGuide.title}</h3>
                <p>{relatedGuide.description}</p>
                <span className="guide-read-more">
                  Read guide <ArrowRight size={14} aria-hidden="true" />
                </span>
              </a>
            )}
            {relatedFeature && (
              <a
                href={relatedFeature.path}
                className="guide-related-card"
                aria-label={`Read: ${relatedFeature.heading}`}
              >
                <h3>{relatedFeature.heading}</h3>
                <p>{relatedFeature.summary}</p>
                <span className="guide-read-more">
                  Read more <ArrowRight size={14} aria-hidden="true" />
                </span>
              </a>
            )}
          </div>
        </section>

        <section className="guides-page-cta">
          <h2>See it on your own numbers</h2>
          <p>
            Create a free workspace, record one transaction, and check the draft before it saves. No
            bank login, no card details, and no records you did not add.
          </p>
          <div className="guides-cta-actions">
            <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
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
