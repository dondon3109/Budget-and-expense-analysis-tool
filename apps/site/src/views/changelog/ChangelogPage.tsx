import { CheckCircle2, ArrowRight } from "lucide-react";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { currentRelease, releaseHistory } from "@zoption/web-common/releases";
import "./ChangelogPage.css";
import { appUrl } from "../../lib/appUrl";

export function ChangelogPage() {
  return (
    <LegalPageLayout
      title="Changelog & Product Updates"
      summary="A complete record of new features, enhancements, and improvements across the Zoption web workspace and Android apps."
      lastUpdated={currentRelease.releasedOn}
    >
      <div className="changelog-page-list">
        {releaseHistory.map((release, index) => (
          <article
            key={`${release.version}-${index}`}
            className={`changelog-release-card ${index === 0 ? "current-release" : ""}`}
          >
            <header className="changelog-release-header">
              <div className="changelog-release-meta">
                <span className="changelog-version-tag">v{release.version}</span>
                {index === 0 && <span className="changelog-latest-tag">Latest</span>}
              </div>
              <time className="changelog-release-date">{release.releasedOn}</time>
            </header>
            <ul className="changelog-changes-list">
              {release.changes.map((change) => (
                <li key={change.title} className="changelog-change-item">
                  <CheckCircle2 size={16} className="changelog-check-icon" aria-hidden="true" />
                  <div className="changelog-change-body">
                    <h2>{change.title}</h2>
                    <p>{change.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <section className="changelog-page-cta">
        <h2>Experience Zoption's private workspace</h2>
        <p>
          Import your statements, record spending with speech or receipts, and plan budgets with
          exact centavo accuracy — starting completely free and private.
        </p>
        <div className="changelog-cta-actions">
          <a className="button primary" href={appUrl("/signup")}>
            Create your workspace <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className="button secondary" href="/install">
            Download Android Beta APK
          </a>
        </div>
      </section>
    </LegalPageLayout>
  );
}
